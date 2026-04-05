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
var NatsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NatsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nats = require("nats");
let NatsService = NatsService_1 = class NatsService {
    configService;
    logger = new common_1.Logger(NatsService_1.name);
    client = null;
    jsClient = null;
    constructor(configService) {
        this.configService = configService;
    }
    async onModuleInit() {
        await this.connect();
    }
    async connect() {
        try {
            const natsUrl = this.configService.get('NATS_URL') || 'nats://localhost:4222';
            this.client = await nats.connect({
                servers: natsUrl,
            });
            this.jsClient = this.client.jetstream();
            this.logger.log(`Connected to NATS at ${natsUrl}`);
        }
        catch (error) {
            this.logger.error(`Failed to connect to NATS: ${error}`);
            throw error;
        }
    }
    getClient() {
        if (!this.client) {
            throw new Error('NATS client not connected');
        }
        return this.client;
    }
    getJetStreamClient() {
        if (!this.jsClient) {
            throw new Error('NATS JetStream client not available');
        }
        return this.jsClient;
    }
    async onModuleDestroy() {
        if (this.client) {
            await this.client.close();
            this.logger.log('Disconnected from NATS');
        }
    }
};
exports.NatsService = NatsService;
exports.NatsService = NatsService = NatsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], NatsService);
//# sourceMappingURL=nats.service.js.map