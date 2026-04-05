"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var FeedIngestionSubscriber_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedIngestionSubscriber = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const zod_1 = require("zod");
const types_1 = require("../../../../packages/types/src");
const nats_service_1 = require("../nats/nats.service");
const feed_snapshot_repository_1 = require("./feed-snapshot.repository");
const version_pointer_repository_1 = require("./version-pointer.repository");
const EventPayloadSchema = zod_1.z.object({
    publisherId: zod_1.z.string(),
    datafeedId: zod_1.z.string(),
    endpointId: zod_1.z.string(),
    version: zod_1.z.string(),
    ingestedAt: zod_1.z.string(),
    sourceFormat: zod_1.z.enum(['csv', 'xml', 'json']),
    rowCount: zod_1.z.number(),
    s3Key: zod_1.z.string(),
});
let FeedIngestionSubscriber = FeedIngestionSubscriber_1 = class FeedIngestionSubscriber {
    natsService;
    configService;
    feedSnapshotRepository;
    versionPointerRepository;
    logger = new common_1.Logger(FeedIngestionSubscriber_1.name);
    s3Client;
    constructor(natsService, configService, feedSnapshotRepository, versionPointerRepository) {
        this.natsService = natsService;
        this.configService = configService;
        this.feedSnapshotRepository = feedSnapshotRepository;
        this.versionPointerRepository = versionPointerRepository;
        const s3Endpoint = this.configService.get('S3_ENDPOINT') || 'http://localhost:9000';
        const s3Region = this.configService.get('S3_REGION') || 'us-east-1';
        const s3AccessKey = this.configService.get('S3_ACCESS_KEY');
        const s3SecretKey = this.configService.get('S3_SECRET_KEY');
        this.s3Client = new client_s3_1.S3Client({
            region: s3Region,
            endpoint: s3Endpoint,
            credentials: {
                accessKeyId: s3AccessKey || '',
                secretAccessKey: s3SecretKey || '',
            },
            forcePathStyle: true,
        });
    }
    async onModuleInit() {
        await this.subscribe();
    }
    async subscribe() {
        try {
            const js = this.natsService.getJetStreamClient();
            try {
                await js.streams.info('DATAFEEDS');
            }
            catch {
                this.logger.log('Creating DATAFEEDS stream...');
                await js.streams.add({
                    name: 'DATAFEEDS',
                    subjects: [types_1.DATAFEED_VERSION_CREATED_SUBJECT],
                });
            }
            const subscription = await js.subscribe(types_1.DATAFEED_VERSION_CREATED_SUBJECT, {
                queue: 'endpointer-api-feed-ingestion',
            });
            this.logger.log('NATS subscriber connected to ' + types_1.DATAFEED_VERSION_CREATED_SUBJECT);
            (async () => {
                for await (const msg of subscription) {
                    try {
                        await this.handleEvent(msg);
                    }
                    catch (error) {
                        this.logger.error(`Error handling event: ${error}`, error instanceof Error ? error.stack : '');
                    }
                }
            })().catch((err) => this.logger.error('Subscription error: ' + err));
        }
        catch (error) {
            this.logger.error(`Failed to subscribe to NATS: ${error}`);
            throw error;
        }
    }
    async handleEvent(msg) {
        try {
            const data = JSON.parse(new TextDecoder().decode(msg.data));
            let payload;
            try {
                payload = EventPayloadSchema.parse(data);
            }
            catch (validationError) {
                this.logger.warn(`Invalid payload received for endpointId=${data.endpointId}: ${validationError}`);
                msg.ack();
                return;
            }
            const bucket = this.configService.get('S3_BUCKET') || 'endpointer-feeds';
            const command = new client_s3_1.GetObjectCommand({
                Bucket: bucket,
                Key: payload.s3Key,
            });
            const response = await this.s3Client.send(command);
            const content = await response.Body?.transformToString();
            let rows = [];
            if (content) {
                rows = this.parseContent(content, payload.sourceFormat);
            }
            await this.feedSnapshotRepository.create({
                endpointId: payload.endpointId,
                version: payload.version,
                ingestedAt: new Date(payload.ingestedAt),
                sourceFormat: payload.sourceFormat,
                rowCount: payload.rowCount,
                s3Key: payload.s3Key,
                content: rows,
            });
            await this.versionPointerRepository.upsert(payload.endpointId, payload.version);
            msg.ack();
            this.logger.debug(`Processed event: endpointId=${payload.endpointId}, version=${payload.version}`);
        }
        catch (error) {
            this.logger.error(`Error saving to MongoDB: ${error}`);
        }
    }
    parseContent(content, format) {
        if (format === 'csv') {
            const lines = content.trim().split('\n');
            if (lines.length === 0)
                return [];
            const headers = lines[0].split(',').map((h) => h.trim());
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map((v) => v.trim());
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                rows.push(row);
            }
            return rows;
        }
        return [];
    }
};
exports.FeedIngestionSubscriber = FeedIngestionSubscriber;
exports.FeedIngestionSubscriber = FeedIngestionSubscriber = FeedIngestionSubscriber_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nats_service_1.NatsService,
        config_1.ConfigService,
        feed_snapshot_repository_1.FeedSnapshotRepository,
        version_pointer_repository_1.VersionPointerRepository])
], FeedIngestionSubscriber);
//# sourceMappingURL=feed-ingestion.subscriber.js.map