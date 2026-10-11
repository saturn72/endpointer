import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient, type Db } from 'mongodb';
import { migrate } from './migrate-datafeeds';

// Requires a live MongoDB: MONGODB_URI=mongodb://localhost:27017 npm run test:unit
const uri = process.env.MONGODB_URI;
const skip = uri ? false : 'MONGODB_URI not set';

let client: MongoClient;
let db: Db;

before(async () => {
    if (!uri) return;
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('dashboard_migration_test');
});

after(async () => {
    if (!uri) return;
    await db.dropDatabase();
    await client.close();
});

beforeEach(async () => {
    if (!uri) return;
    await db.dropDatabase();
    // Legacy index that exists in production and must not block the migration.
    await db.collection('versions').createIndex(
        { endpoint_name: 1, major: 1, minor: 1 },
        { unique: true, name: 'versions_unique_version' },
    );
});

test('moves id_field and versions onto a new datafeed', { skip }, async () => {
    await db.collection('endpoints').insertOne({
        owner_id: 'u1', name: 'products', id_field: 'sku', last_upload_checksum: 'abc', created_at: new Date('2026-01-01'),
    });
    await db.collection('versions').insertMany([
        { endpoint_name: 'products', major: 1, minor: 0, content: [] },
        { endpoint_name: 'products', major: 1, minor: 1, content: [] },
        { endpoint_name: 'other', major: 1, minor: 0, content: [] },
    ]);

    const res = await migrate(db);
    assert.deepEqual(res, { datafeedsCreated: 1, endpointsMigrated: 1, versionsRekeyed: 2 });

    const ep = await db.collection('endpoints').findOne({ name: 'products' });
    assert.ok(ep);
    assert.deepEqual(ep.version_policy, { mode: 'latest' });
    assert.equal(ep.id_field, undefined);
    assert.equal(ep.last_upload_checksum, undefined);

    const df = await db.collection('datafeeds').findOne({});
    assert.ok(df);
    assert.equal(df._id.toHexString(), ep.datafeed_id);
    assert.equal(df.owner_id, 'u1');
    assert.equal(df.name, 'products');
    assert.equal(df.adapter, 'static-file');
    assert.deepEqual(df.adapter_config, { id_field: 'sku' });
    assert.equal(df.last_upload_checksum, 'abc');

    assert.equal(await db.collection('versions').countDocuments({ datafeed_id: ep.datafeed_id }), 2);
    assert.equal(await db.collection('versions').countDocuments({ endpoint_name: 'products' }), 0);
    // Untouched: belongs to no endpoint.
    assert.equal(await db.collection('versions').countDocuments({ endpoint_name: 'other' }), 1);
});

test('endpoint without id_field gets a null id_field', { skip }, async () => {
    await db.collection('endpoints').insertOne({ owner_id: 'u1', name: 'plain', created_at: new Date() });
    await migrate(db);
    const df = await db.collection('datafeeds').findOne({ name: 'plain' });
    assert.deepEqual(df?.adapter_config, { id_field: null });
});

test('is idempotent', { skip }, async () => {
    await db.collection('endpoints').insertOne({ owner_id: 'u1', name: 'a', id_field: 'id', created_at: new Date() });
    await db.collection('versions').insertOne({ endpoint_name: 'a', major: 1, minor: 0, content: [] });

    await migrate(db);
    const second = await migrate(db);

    assert.deepEqual(second, { datafeedsCreated: 0, endpointsMigrated: 0, versionsRekeyed: 0 });
    assert.equal(await db.collection('datafeeds').countDocuments({}), 1);
});

test('recovers from a crash after the datafeed was created', { skip }, async () => {
    const ep = await db.collection('endpoints').insertOne({ owner_id: 'u1', name: 'a', id_field: 'id', created_at: new Date() });
    await db.collection('versions').insertOne({ endpoint_name: 'a', major: 1, minor: 0, content: [] });
    // State left behind by a failed run: datafeed exists, endpoint not yet updated.
    await db.collection('datafeeds').insertOne({
        owner_id: 'u1', name: 'a', adapter: 'static-file', adapter_config: { id_field: 'id' }, migrated_from_endpoint: ep.insertedId,
    });

    const res = await migrate(db);

    assert.equal(res.datafeedsCreated, 0);
    assert.equal(res.endpointsMigrated, 1);
    assert.equal(await db.collection('datafeeds').countDocuments({}), 1);
    const migrated = await db.collection('endpoints').findOne({ name: 'a' });
    assert.equal(await db.collection('versions').countDocuments({ datafeed_id: migrated?.datafeed_id }), 1);
});

test('same endpoint name under two owners: versions go to the oldest', { skip }, async () => {
    await db.collection('endpoints').insertMany([
        { owner_id: 'u2', name: 'dup', created_at: new Date('2026-03-01') },
        { owner_id: 'u1', name: 'dup', created_at: new Date('2026-01-01') },
    ]);
    await db.collection('versions').insertOne({ endpoint_name: 'dup', major: 1, minor: 0, content: [] });

    const res = await migrate(db);
    assert.equal(res.endpointsMigrated, 2);
    assert.equal(res.versionsRekeyed, 1);

    const oldest = await db.collection('endpoints').findOne({ owner_id: 'u1', name: 'dup' });
    const newest = await db.collection('endpoints').findOne({ owner_id: 'u2', name: 'dup' });
    assert.equal(await db.collection('versions').countDocuments({ datafeed_id: oldest?.datafeed_id }), 1);
    assert.equal(await db.collection('versions').countDocuments({ datafeed_id: newest?.datafeed_id }), 0);
});

test('multiple versions with the old unique index do not collide after rekey', { skip }, async () => {
    for (const name of ['a', 'b']) {
        await db.collection('endpoints').insertOne({ owner_id: 'u1', name, created_at: new Date() });
        await db.collection('versions').insertOne({ endpoint_name: name, major: 1, minor: 0, content: [] });
    }
    const res = await migrate(db);
    assert.equal(res.versionsRekeyed, 2);
});
