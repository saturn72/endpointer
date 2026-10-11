import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient, type Db } from 'mongodb';
import {
    validateName,
    insertDatafeed,
    createEndpointForDatafeed,
    findOwnedDatafeed,
    backfillOwnerUsername,
} from './datafeeds';

// Requires a live MongoDB: MONGODB_URI=mongodb://localhost:27017 npm run test:unit
const uri = process.env.MONGODB_URI;
const skip = uri ? false : 'MONGODB_URI not set';

let client: MongoClient;
let db: Db;

before(async () => {
    if (!uri) return;
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('dashboard_datafeeds_test');
});
after(async () => {
    if (!uri) return;
    await db.dropDatabase();
    await client.close();
});
beforeEach(async () => {
    if (!uri) return;
    await db.dropDatabase();
    await db.collection('datafeeds').createIndex({ owner_id: 1, name: 1 }, { unique: true });
    await db.collection('endpoints').createIndex(
        { owner_username: 1, name: 1 },
        { unique: true, partialFilterExpression: { owner_username: { $type: 'string' } } },
    );
});

test('validateName', () => {
    assert.equal(validateName('ok-name_1', 'X'), null);
    assert.match(validateName('', 'Datafeed name')!, /required/);
    assert.match(validateName('a'.repeat(101), 'X')!, /100 characters/);
    for (const bad of ['has space', 'a/b', '../x', 'a.b', 'ünï', 'a?b', '<script>']) {
        assert.match(validateName(bad, 'X')!, /only letters/, bad);
    }
});

test('insertDatafeed stores a static-file datafeed with its id field', { skip }, async () => {
    const id = await insertDatafeed(db, { ownerId: 'u1', name: 'catalog', idField: 'sku' });
    const df = await findOwnedDatafeed(db, 'u1', id);
    assert.ok(df);
    assert.equal(df.adapter, 'static-file');
    assert.deepEqual(df.adapter_config, { id_field: 'sku' });
    assert.equal(df._id.toHexString(), id);
});

test('datafeed names are unique per owner, not globally', { skip }, async () => {
    await insertDatafeed(db, { ownerId: 'u1', name: 'catalog', idField: null });
    await insertDatafeed(db, { ownerId: 'u2', name: 'catalog', idField: null });
    await assert.rejects(insertDatafeed(db, { ownerId: 'u1', name: 'catalog', idField: null }), { code: 11000 });
});

test('findOwnedDatafeed hides other owners and malformed ids', { skip }, async () => {
    const id = await insertDatafeed(db, { ownerId: 'u1', name: 'a', idField: null });
    assert.equal(await findOwnedDatafeed(db, 'u2', id), null);
    assert.equal(await findOwnedDatafeed(db, 'u1', 'not-an-object-id'), null);
    assert.equal(await findOwnedDatafeed(db, 'u1', '000000000000000000000000'), null);
    assert.ok(await findOwnedDatafeed(db, 'u1', id));
});

test('endpoint defaults to the latest version policy and records the owner username', { skip }, async () => {
    const dfId = await insertDatafeed(db, { ownerId: 'u1', name: 'a', idField: null });
    await createEndpointForDatafeed(db, { ownerId: 'u1', ownerUsername: 'alice', datafeedId: dfId, name: 'prices' });
    const ep = await db.collection('endpoints').findOne({ name: 'prices' });
    assert.deepEqual(ep?.version_policy, { mode: 'latest' });
    assert.equal(ep?.owner_username, 'alice');
    assert.equal(ep?.datafeed_id, dfId);
});

test('endpoint names are unique per username; two endpoints can share a datafeed', { skip }, async () => {
    const dfId = await insertDatafeed(db, { ownerId: 'u1', name: 'a', idField: null });
    await createEndpointForDatafeed(db, { ownerId: 'u1', ownerUsername: 'alice', datafeedId: dfId, name: 'prices' });
    await createEndpointForDatafeed(db, { ownerId: 'u1', ownerUsername: 'alice', datafeedId: dfId, name: 'inventory' });
    await assert.rejects(
        createEndpointForDatafeed(db, { ownerId: 'u1', ownerUsername: 'alice', datafeedId: dfId, name: 'prices' }),
        { code: 11000 },
    );
    const otherDf = await insertDatafeed(db, { ownerId: 'u2', name: 'a', idField: null });
    await createEndpointForDatafeed(db, { ownerId: 'u2', ownerUsername: 'bob', datafeedId: otherDf, name: 'prices' });
});

test('backfillOwnerUsername only touches the owner’s endpoints without a username', { skip }, async () => {
    await db.collection('endpoints').insertMany([
        { owner_id: 'u1', name: 'legacy1' },
        { owner_id: 'u1', name: 'legacy2' },
        { owner_id: 'u2', name: 'other' },
        { owner_id: 'u1', name: 'done', owner_username: 'alice' },
    ]);
    await backfillOwnerUsername(db, 'u1', 'alice');
    const rows = await db.collection('endpoints').find({}).toArray();
    const by = Object.fromEntries(rows.map((r) => [r.name, r.owner_username]));
    assert.deepEqual(by, { legacy1: 'alice', legacy2: 'alice', other: undefined, done: 'alice' });
});
