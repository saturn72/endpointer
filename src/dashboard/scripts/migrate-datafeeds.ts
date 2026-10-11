import { MongoClient, ObjectId, type Db } from 'mongodb';
import { config } from 'dotenv';
import { resolve } from 'path';

// Moves the legacy model (endpoint owns id_field and versions by endpoint_name) to the
// datafeed model of ADR 002. Idempotent: safe to re-run after a partial failure.
//
// Legacy versions are keyed by endpoint name only. If two owners used the same name, the
// versions go to the oldest endpoint (processed first); later ones start empty.
export interface MigrationResult {
    datafeedsCreated: number;
    endpointsMigrated: number;
    versionsRekeyed: number;
}

export async function migrate(db: Db): Promise<MigrationResult> {
    const result: MigrationResult = { datafeedsCreated: 0, endpointsMigrated: 0, versionsRekeyed: 0 };

    // The old unique index would collide once endpoint_name is unset.
    for (const name of ['versions_unique_version', 'versions_endpoint_version']) {
        try {
            await db.collection('versions').dropIndex(name);
        } catch {
            // index absent
        }
    }

    const legacy = await db
        .collection('endpoints')
        .find({ datafeed_id: { $exists: false } })
        .sort({ created_at: 1, _id: 1 })
        .toArray();

    for (const ep of legacy) {
        // A crash between steps leaves a datafeed tagged with the endpoint id; reuse it.
        let df = await db.collection('datafeeds').findOne({ migrated_from_endpoint: ep._id });
        if (!df) {
            const now = new Date();
            const doc = {
                owner_id: ep.owner_id ?? null,
                name: ep.name,
                description: '',
                adapter: 'static-file',
                adapter_config: { id_field: ep.id_field ?? null },
                last_upload_checksum: ep.last_upload_checksum ?? null,
                created_at: ep.created_at ?? now,
                updated_at: now,
                migrated_from_endpoint: ep._id,
            };
            const res = await db.collection('datafeeds').insertOne(doc);
            df = { _id: res.insertedId, ...doc };
            result.datafeedsCreated++;
        }
        const datafeedId = (df._id as ObjectId).toHexString();

        const vres = await db
            .collection('versions')
            .updateMany(
                { endpoint_name: ep.name, datafeed_id: { $exists: false } },
                { $set: { datafeed_id: datafeedId }, $unset: { endpoint_name: '' } },
            );
        result.versionsRekeyed += vres.modifiedCount;

        await db.collection('endpoints').updateOne(
            { _id: ep._id },
            {
                $set: { datafeed_id: datafeedId, version_policy: { mode: 'latest' } },
                $unset: { id_field: '', last_upload_checksum: '' },
            },
        );
        result.endpointsMigrated++;
    }
    return result;
}

async function main() {
    config({ path: resolve(process.cwd(), '.env.local') });
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB;
    if (!uri) throw new Error('MONGODB_URI is not set');
    if (!dbName) throw new Error('MONGODB_DB is not set');

    const client = new MongoClient(uri);
    try {
        await client.connect();
        const result = await migrate(client.db(dbName));
        console.log('Migration complete:', result);
        console.log('Now run: npm run db:init');
    } finally {
        await client.close();
    }
}

if (process.argv[1]?.endsWith('migrate-datafeeds.ts')) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
