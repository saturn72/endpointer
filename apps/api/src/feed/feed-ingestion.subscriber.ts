import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { DatafeedVersionCreatedPayload, DATAFEED_VERSION_CREATED_SUBJECT } from '@endpointer/types';
import * as nats from 'nats';
import { NatsService } from '../nats/nats.service';
import { FeedSnapshotRepository } from './feed-snapshot.repository';
import { VersionPointerRepository } from './version-pointer.repository';

const EventPayloadSchema = z.object({
  publisherId: z.string(),
  datafeedId: z.string(),
  endpointId: z.string(),
  version: z.string(),
  ingestedAt: z.string(),
  sourceFormat: z.enum(['csv', 'xml', 'json']),
  rowCount: z.number(),
  s3Key: z.string(),
});

@Injectable()
export class FeedIngestionSubscriber implements OnModuleInit {
  private readonly logger = new Logger(FeedIngestionSubscriber.name);
  private s3Client: S3Client;

  constructor(
    private natsService: NatsService,
    private configService: ConfigService,
    private feedSnapshotRepository: FeedSnapshotRepository,
    private versionPointerRepository: VersionPointerRepository,
  ) {
    const s3Endpoint = this.configService.get<string>('S3_ENDPOINT') || 'http://localhost:9000';
    const s3Region = this.configService.get<string>('S3_REGION') || 'us-east-1';
    const s3AccessKey = this.configService.get<string>('S3_ACCESS_KEY');
    const s3SecretKey = this.configService.get<string>('S3_SECRET_KEY');

    this.s3Client = new S3Client({
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

  private async subscribe(): Promise<void> {
    try {
      const js = this.natsService.getJetStreamClient();
      
      // Ensure stream exists (try to get info, if fails create it)
      try {
        await (js as any).streams.info('DATAFEEDS');
      } catch {
        this.logger.log('Creating DATAFEEDS stream...');
        await (js as any).streams.add({
          name: 'DATAFEEDS',
          subjects: [DATAFEED_VERSION_CREATED_SUBJECT],
        });
      }

      // Subscribe to the subject
      const subscription = await js.subscribe(DATAFEED_VERSION_CREATED_SUBJECT, {
        queue: 'endpointer-api-feed-ingestion',
      });

      this.logger.log('NATS subscriber connected to ' + DATAFEED_VERSION_CREATED_SUBJECT);

      // Handle messages
      (async () => {
        for await (const msg of subscription) {
          try {
            await this.handleEvent(msg);
          } catch (error) {
            this.logger.error(`Error handling event: ${error}`, error instanceof Error ? error.stack : '');
          }
        }
      })().catch((err) => this.logger.error('Subscription error: ' + err));
    } catch (error) {
      this.logger.error(`Failed to subscribe to NATS: ${error}`);
      throw error;
    }
  }

  private async handleEvent(msg: nats.JsMsg): Promise<void> {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.data));

      // Validate payload
      let payload: DatafeedVersionCreatedPayload;
      try {
        payload = EventPayloadSchema.parse(data);
      } catch (validationError) {
        this.logger.warn(
          `Invalid payload received for endpointId=${data.endpointId}: ${validationError}`,
        );
        msg.ack();
        return;
      }

      // Fetch content from MinIO
      const bucket = this.configService.get<string>('S3_BUCKET') || 'endpointer-feeds';
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: payload.s3Key,
      });

      const response = await this.s3Client.send(command);
      const content = await response.Body?.transformToString();

      // Parse content based on source format
      let rows: Array<Record<string, string>> = [];
      if (content) {
        rows = this.parseContent(content, payload.sourceFormat);
      }

      // Write to MongoDB
      await this.feedSnapshotRepository.create({
        endpointId: payload.endpointId,
        version: payload.version,
        ingestedAt: new Date(payload.ingestedAt),
        sourceFormat: payload.sourceFormat,
        rowCount: payload.rowCount,
        s3Key: payload.s3Key,
        content: rows,
      });

      // Update version pointer
      await this.versionPointerRepository.upsert(payload.endpointId, payload.version);

      // Acknowledge message
      msg.ack();

      this.logger.debug(
        `Processed event: endpointId=${payload.endpointId}, version=${payload.version}`,
      );
    } catch (error) {
      this.logger.error(`Error saving to MongoDB: ${error}`);
      // Do NOT acknowledge message to trigger redelivery
    }
  }

  private parseContent(content: string, format: string): Array<Record<string, string>> {
    // Simple CSV parser for MVP
    if (format === 'csv') {
      const lines = content.trim().split('\n');
      if (lines.length === 0) return [];

      const headers = lines[0].split(',').map((h) => h.trim());
      const rows: Array<Record<string, string>> = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row);
      }
      return rows;
    }

    // TODO: post-MVP - implement XML and JSON parsers
    return [];
  }
}