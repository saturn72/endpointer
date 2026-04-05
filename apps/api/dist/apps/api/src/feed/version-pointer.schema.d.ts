import { Document } from 'mongoose';
export type VersionPointerDocument = VersionPointer & Document;
export declare class VersionPointer {
    endpointId: string;
    latestVersion: string;
    updatedAt?: Date;
}
export declare const VersionPointerSchema: import("mongoose").Schema<VersionPointer, import("mongoose").Model<VersionPointer, any, any, any, Document<unknown, any, VersionPointer, any, {}> & VersionPointer & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, VersionPointer, Document<unknown, {}, import("mongoose").FlatRecord<VersionPointer>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<VersionPointer> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
