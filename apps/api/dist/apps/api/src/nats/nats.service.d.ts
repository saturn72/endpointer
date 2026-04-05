import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nats from 'nats';
export declare class NatsService implements OnModuleInit {
    private configService;
    private readonly logger;
    private client;
    private jsClient;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    private connect;
    getClient(): nats.NatsConnection;
    getJetStreamClient(): nats.JetStreamClient;
    onModuleDestroy(): Promise<void>;
}
