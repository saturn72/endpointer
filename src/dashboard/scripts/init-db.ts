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

        await db
            .collection('endpoints')
            .createIndex({ name: 1 }, { unique: true, name: 'endpoints_name_unique' });
        console.log('✓ Unique index created on endpoints.name');

        await db
            .collection('versions')
            .createIndex(
                { endpoint_name: 1, major: -1, minor: -1 },
                { name: 'versions_endpoint_version' },
            );
        await db
            .collection('versions')
            .createIndex(
                { endpoint_name: 1, major: 1, minor: 1 },
                { unique: true, name: 'versions_unique_version' },
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
