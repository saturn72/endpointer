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
exports.VersionPointerSchema = exports.VersionPointer = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let VersionPointer = class VersionPointer {
    endpointId;
    latestVersion;
    updatedAt;
};
exports.VersionPointer = VersionPointer;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], VersionPointer.prototype, "endpointId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], VersionPointer.prototype, "latestVersion", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], VersionPointer.prototype, "updatedAt", void 0);
exports.VersionPointer = VersionPointer = __decorate([
    (0, mongoose_1.Schema)({ collection: 'version_pointers' })
], VersionPointer);
exports.VersionPointerSchema = mongoose_1.SchemaFactory.createForClass(VersionPointer);
//# sourceMappingURL=version-pointer.schema.js.map