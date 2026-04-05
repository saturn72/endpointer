import { Model } from 'mongoose';
import { FeedSnapshot, FeedSnapshotDocument } from './feed-snapshot.schema';
export declare class FeedSnapshotRepository {
    private model;
    constructor(model: Model<FeedSnapshotDocument>);
    create(snapshot: Partial<FeedSnapshot>): Promise<FeedSnapshot>;
    findByEndpointId(endpointId: string): Promise<FeedSnapshot | null>;
    findLatestByEndpointIdAndVersion(endpointId: string, version: string): Promise<FeedSnapshot | null>;
}
