import type { Db, ObjectId } from 'mongodb';
import { ObjectId as Oid } from 'mongodb';

export const SAFE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const MAX_NAME_LENGTH = 100;

export interface DatafeedDoc {
    _id: ObjectId;
    owner_id: string;
    name: string;
    description: string;
    adapter: 'static-file';
    adapter_config: { id_field: string | null };
    last_upload_checksum?: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface EndpointDoc {
    _id: ObjectId;
    owner_id: string;
    owner_username?: string;
    name: string;
    datafeed_id: string; // hex of datafeeds._id; also the S3 key prefix and versions.datafeed_id
    version_policy: { mode: 'latest' } | { mode: 'pinned'; major: number; minor: number };
    created_at: Date;
}

export function validateName(value: string, label: string): string | null {
    if (!value) return `${label} is required`;
    if (value.length > MAX_NAME_LENGTH) return `${label} must be ${MAX_NAME_LENGTH} characters or fewer`;
    if (!SAFE_NAME_PATTERN.test(value)) {
        return `${label} must contain only letters, numbers, dashes, and underscores`;
    }
    return null;
}

export async function createEndpointForDatafeed(
    db: Db,
    args: {
        ownerId: string;
        ownerUsername: string;
        datafeedId: string;
        name: string;
    },
): Promise<void> {
    await db.collection<Omit<EndpointDoc, '_id'>>('endpoints').insertOne({
        owner_id: args.ownerId,
        owner_username: args.ownerUsername,
        name: args.name,
        datafeed_id: args.datafeedId,
        version_policy: { mode: 'latest' },
        created_at: new Date(),
    });
}

export async function insertDatafeed(
    db: Db,
    args: { ownerId: string; name: string; description?: string; idField: string | null },
): Promise<string> {
    const now = new Date();
    const res = await db.collection<Omit<DatafeedDoc, '_id'>>('datafeeds').insertOne({
        owner_id: args.ownerId,
        name: args.name,
        description: args.description ?? '',
        adapter: 'static-file',
        adapter_config: { id_field: args.idField },
        last_upload_checksum: null,
        created_at: now,
        updated_at: now,
    });
    return res.insertedId.toHexString();
}

// Datafeed owned by ownerId, or null. Malformed ids are treated as not found.
export async function findOwnedDatafeed(
    db: Db,
    ownerId: string,
    datafeedId: string,
): Promise<DatafeedDoc | null> {
    if (!Oid.isValid(datafeedId)) return null;
    return db
        .collection<DatafeedDoc>('datafeeds')
        .findOne({ _id: new Oid(datafeedId), owner_id: ownerId });
}

// Endpoints created before usernames were stored get the owner's username on first visit.
export async function backfillOwnerUsername(db: Db, ownerId: string, username: string): Promise<void> {
    await db
        .collection('endpoints')
        .updateMany({ owner_id: ownerId, owner_username: { $exists: false } }, { $set: { owner_username: username } });
}
