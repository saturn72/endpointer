import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB;

    if (!uri) throw new Error('MONGODB_URI is not set');
    if (!dbName) throw new Error('MONGODB_DB is not set');

    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);

        try {
            await db.collection('endpoints').dropIndex('endpoints_name_unique');
        } catch {
            // index absent
        }
        await db
            .collection('endpoints')
            .createIndex(
                { owner_id: 1, name: 1 },
                { unique: true, name: 'endpoints_owner_name_unique' },
            );
        console.log('✓ Unique index created on endpoints (owner_id, name)');

        // Public URLs resolve <user_name>/<endpoint_name>. Partial: endpoints created
        // before usernames were stored get theirs on the owner's first visit.
        await db.collection('endpoints').createIndex(
            { owner_username: 1, name: 1 },
            {
                unique: true,
                name: 'endpoints_username_name_unique',
                partialFilterExpression: { owner_username: { $type: 'string' } },
            },
        );
        await db
            .collection('datafeeds')
            .createIndex({ owner_id: 1, name: 1 }, { unique: true, name: 'datafeeds_owner_name_unique' });
        console.log('✓ Indexes created on endpoints (owner_username, name) and datafeeds (owner_id, name)');

        // Legacy endpoint_name indexes; run `npm run db:migrate` first on existing data.
        for (const legacy of ['versions_endpoint_version', 'versions_unique_version']) {
            try {
                await db.collection('versions').dropIndex(legacy);
            } catch {
                // index absent
            }
        }
        await db
            .collection('versions')
            .createIndex(
                { datafeed_id: 1, major: -1, minor: -1 },
                { name: 'versions_datafeed_version' },
            );
        await db
            .collection('versions')
            .createIndex(
                { datafeed_id: 1, major: 1, minor: 1 },
                { unique: true, name: 'versions_datafeed_unique_version' },
            );
        console.log('✓ Indexes created on versions collection');
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
