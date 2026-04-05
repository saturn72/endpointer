"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const feed_snapshot_schema_1 = require("./feed-snapshot.schema");
const version_pointer_schema_1 = require("./version-pointer.schema");
const feed_snapshot_repository_1 = require("./feed-snapshot.repository");
const version_pointer_repository_1 = require("./version-pointer.repository");
const feed_ingestion_subscriber_1 = require("./feed-ingestion.subscriber");
const nats_module_1 = require("../nats/nats.module");
let FeedModule = class FeedModule {
};
exports.FeedModule = FeedModule;
exports.FeedModule = FeedModule = __decorate([
    (0, common_1.Module)({
        imports: [
            nats_module_1.NatsModule,
            mongoose_1.MongooseModule.forFeature([
                { name: feed_snapshot_schema_1.FeedSnapshot.name, schema: feed_snapshot_schema_1.FeedSnapshotSchema },
                { name: version_pointer_schema_1.VersionPointer.name, schema: version_pointer_schema_1.VersionPointerSchema },
            ]),
        ],
        providers: [feed_snapshot_repository_1.FeedSnapshotRepository, version_pointer_repository_1.VersionPointerRepository, feed_ingestion_subscriber_1.FeedIngestionSubscriber],
        exports: [feed_snapshot_repository_1.FeedSnapshotRepository, version_pointer_repository_1.VersionPointerRepository],
    })
], FeedModule);
//# sourceMappingURL=feed.module.js.map