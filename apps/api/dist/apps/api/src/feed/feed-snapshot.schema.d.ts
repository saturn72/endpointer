import { Document } from 'mongoose';
export type FeedSnapshotDocument = FeedSnapshot & Document;
export declare class FeedSnapshot {
    endpointId: string;
    version: string;
    ingestedAt: Date;
    sourceFormat: string;
    rowCount: number;
    s3Key: string;
    content: Array<Record<string, string>>;
    createdAt?: Date;
}
export declare const FeedSnapshotSchema: import("mongoose").Schema<FeedSnapshot, import("mongoose").Model<FeedSnapshot, any, any, any, Document<unknown, any, FeedSnapshot, any, {}> & FeedSnapshot & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, FeedSnapshot, Document<unknown, {}, import("mongoose").FlatRecord<FeedSnapshot>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<FeedSnapshot> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
