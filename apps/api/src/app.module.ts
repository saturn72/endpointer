import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { z } from 'zod';
import type { FeedRequestDto } from '@endpointer/types';
import { HealthModule } from './health/health.module';
import { NatsModule } from './nats/nats.module';
import { FeedModule } from './feed/feed.module';

const envSchema = z.object({
    CLERK_SECRET_KEY: z.string().min(1),
    MONGODB_URI: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    NATS_URL: z.string().min(1),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    PORT: z.string().optional(),
});

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: (config) => envSchema.parse(config),
        }),
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                uri: configService.get<string>('MONGODB_URI'),
            }),
        }),
        HealthModule,
        NatsModule,
        FeedModule,
    ],
})
export class AppModule {
    // The imported type ensures @endpointer/types is resolvable in this workspace.
    private readonly _feedRequestDto?: FeedRequestDto;
}