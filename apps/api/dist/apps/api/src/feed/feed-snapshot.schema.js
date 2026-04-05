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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedSnapshotSchema = exports.FeedSnapshot = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let FeedSnapshot = class FeedSnapshot {
    endpointId;
    version;
    ingestedAt;
    sourceFormat;
    rowCount;
    s3Key;
    content;
    createdAt;
};
exports.FeedSnapshot = FeedSnapshot;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], FeedSnapshot.prototype, "endpointId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], FeedSnapshot.prototype, "version", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Date)
], FeedSnapshot.prototype, "ingestedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], FeedSnapshot.prototype, "sourceFormat", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], FeedSnapshot.prototype, "rowCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], FeedSnapshot.prototype, "s3Key", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Object], required: true }),
    __metadata("design:type", Array)
], FeedSnapshot.prototype, "content", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], FeedSnapshot.prototype, "createdAt", void 0);
exports.FeedSnapshot = FeedSnapshot = __decorate([
    (0, mongoose_1.Schema)({ collection: 'feed_snapshots' })
], FeedSnapshot);
exports.FeedSnapshotSchema = mongoose_1.SchemaFactory.createForClass(FeedSnapshot);
//# sourceMappingURL=feed-snapshot.schema.js.map