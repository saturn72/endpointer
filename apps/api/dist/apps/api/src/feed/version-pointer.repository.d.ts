import { Model } from 'mongoose';
import { VersionPointer, VersionPointerDocument } from './version-pointer.schema';
export declare class VersionPointerRepository {
    private model;
    constructor(model: Model<VersionPointerDocument>);
    upsert(endpointId: string, latestVersion: string): Promise<VersionPointer>;
    findLatestVersion(endpointId: string): Promise<string | null>;
}
