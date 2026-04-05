"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const zod_1 = require("zod");
const health_module_1 = require("./health/health.module");
const nats_module_1 = require("./nats/nats.module");
const feed_module_1 = require("./feed/feed.module");
const envSchema = zod_1.z.object({
    CLERK_SECRET_KEY: zod_1.z.string().min(1),
    MONGODB_URI: zod_1.z.string().min(1),
    DATABASE_URL: zod_1.z.string().min(1),
    NATS_URL: zod_1.z.string().min(1),
    S3_ENDPOINT: zod_1.z.string().optional(),
    S3_ACCESS_KEY: zod_1.z.string().optional(),
    S3_SECRET_KEY: zod_1.z.string().optional(),
    S3_BUCKET: zod_1.z.string().optional(),
    S3_REGION: zod_1.z.string().optional(),
    PORT: zod_1.z.string().optional(),
});
let AppModule = class AppModule {
    _feedRequestDto;
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                validate: (config) => envSchema.parse(config),
            }),
            mongoose_1.MongooseModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    uri: configService.get('MONGODB_URI'),
                }),
            }),
            health_module_1.HealthModule,
            nats_module_1.NatsModule,
            feed_module_1.FeedModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map