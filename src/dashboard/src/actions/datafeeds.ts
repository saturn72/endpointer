'use server';

import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { clientPromise, dbName } from '@/lib/mongodb';
import { requireUser } from '@/lib/session';
import {
    validateName,
    insertDatafeed,
    createEndpointForDatafeed,
    SAFE_NAME_PATTERN,
    MAX_NAME_LENGTH,
} from '@/lib/datafeeds';

const DATAFEEDS_PATH = '/datafeeds';

function fail(message: string, path = `${DATAFEEDS_PATH}?error=`): never {
    redirect(`${path}${encodeURIComponent(message)}`);
}

// Creates the datafeed and, when "create_endpoint" is on (the form default), an endpoint
// pointing at it. The datafeed is created first; if only the endpoint fails the datafeed is
// kept and the user is sent to it with a message so they can retry from there.
export async function createDatafeed(formData: FormData) {
    const { id: ownerId, username } = await requireUser();
    const name = ((formData.get('name') as string) ?? '').trim();
    const description = ((formData.get('description') as string) ?? '').trim().slice(0, 500);
    const idField = ((formData.get('id_field') as string) ?? '').trim() || null;
    const createEndpoint = formData.get('create_endpoint') === 'on';
    const endpointName = ((formData.get('endpoint_name') as string) ?? '').trim() || name;

    const nameError = validateName(name, 'Datafeed name');
    if (nameError) fail(nameError);
    if (idField && !SAFE_NAME_PATTERN.test(idField)) {
        fail('ID field must contain only letters, numbers, dashes, and underscores');
    }
    if (createEndpoint) {
        const epError = validateName(endpointName, 'Endpoint name');
        if (epError) fail(epError);
    }

    let datafeedId: string;
    const client = await clientPromise;
    const db = client.db(dbName);
    try {
        datafeedId = await insertDatafeed(db, { ownerId, name, description, idField });
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) fail('A datafeed with that name already exists');
        console.error('createDatafeed: database error', err);
        redirect(`${DATAFEEDS_PATH}?infraError=1`);
    }

    if (createEndpoint) {
        try {
            await createEndpointForDatafeed(db, { ownerId, ownerUsername: username, datafeedId, name: endpointName });
        } catch (err: unknown) {
            const reason =
                (err as { code?: number }).code === 11000
                    ? `an endpoint named "${endpointName}" already exists`
                    : 'a server error occurred';
            if ((err as { code?: number }).code !== 11000) console.error('createDatafeed: endpoint insert failed', err);
            fail(`Datafeed created, but the endpoint was not: ${reason}. You can create it from the datafeed page.`, `${DATAFEEDS_PATH}/${datafeedId}?error=`);
        }
    }

    redirect(`${DATAFEEDS_PATH}/${datafeedId}`);
}

// Creates an endpoint for an existing datafeed (retry path and the "connect endpoint" form).
export async function createEndpointFromDatafeed(formData: FormData) {
    const { id: ownerId, username } = await requireUser();
    const datafeedId = ((formData.get('datafeed_id') as string) ?? '').trim();
    const name = ((formData.get('endpoint_name') as string) ?? '').trim();
    const back = `${DATAFEEDS_PATH}/${encodeURIComponent(datafeedId)}?error=`;

    const nameError = validateName(name, 'Endpoint name');
    if (nameError) fail(nameError, back);
    if (!ObjectId.isValid(datafeedId)) fail('Datafeed not found');

    const client = await clientPromise;
    const db = client.db(dbName);
    const owned = await db
        .collection('datafeeds')
        .findOne({ _id: new ObjectId(datafeedId), owner_id: ownerId }, { projection: { _id: 1 } });
    if (!owned) fail('Datafeed not found');

    try {
        await createEndpointForDatafeed(db, { ownerId, ownerUsername: username, datafeedId, name });
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) fail('An endpoint with that name already exists', back);
        console.error('createEndpointFromDatafeed: database error', err);
        fail('A server error occurred. Please try again.', back);
    }
    redirect(`${DATAFEEDS_PATH}/${datafeedId}`);
}

// Live availability checks for the creation form. Return null on DB failure so the UI does
// not block; the create actions still enforce uniqueness.
export async function datafeedNameExists(name: string): Promise<boolean | null> {
    const { id: ownerId } = await requireUser();
    if (!SAFE_NAME_PATTERN.test(name) || name.length > MAX_NAME_LENGTH) return false;
    try {
        const client = await clientPromise;
        const doc = await client
            .db(dbName)
            .collection('datafeeds')
            .findOne({ owner_id: ownerId, name }, { projection: { _id: 1 } });
        return doc !== null;
    } catch (err) {
        console.error('datafeedNameExists: database error', err);
        return null;
    }
}
