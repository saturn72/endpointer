import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nats from 'nats';

@Injectable()
export class NatsService implements OnModuleInit {
  private readonly logger = new Logger(NatsService.name);
  private client: nats.NatsConnection | null = null;
  private jsClient: nats.JetStreamClient | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const natsUrl = this.configService.get<string>('NATS_URL') || 'nats://localhost:4222';
      this.client = await nats.connect({
        servers: natsUrl,
      });
      this.jsClient = this.client.jetstream();
      this.logger.log(`Connected to NATS at ${natsUrl}`);
    } catch (error) {
      this.logger.error(`Failed to connect to NATS: ${error}`);
      throw error;
    }
  }

  getClient(): nats.NatsConnection {
    if (!this.client) {
      throw new Error('NATS client not connected');
    }
    return this.client;
  }

  getJetStreamClient(): nats.JetStreamClient {
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
}