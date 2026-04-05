import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { z } from 'zod';
import type { FeedRequestDto } from '@endpointer/types';
import { HealthModule } from './health/health.module';

const envSchema = z.object({
    CLERK_SECRET_KEY: z.string().min(1),
    MONGODB_URI: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    NATS_URL: z.string().min(1),
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
    ],
})
export class AppModule {
    // The imported type ensures @endpointer/types is resolvable in this workspace.
    private readonly _feedRequestDto?: FeedRequestDto;
}