'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import {
    managerCreateDatafeed,
    managerCreateEndpoint,
    managerListDatafeeds,
} from '@/lib/datafeed-manager';
import {
    validateName,
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
    await requireUser();
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
    try {
        const datafeed = await managerCreateDatafeed({
            name,
            description,
            adapter: 'static-file',
            adapter_config: { id_field: idField },
        });
        datafeedId = datafeed._id;
    } catch (err: unknown) {
        if (String(err).includes('already exists')) fail('A datafeed with that name already exists');
        console.error('createDatafeed: manager error', err);
        redirect(`${DATAFEEDS_PATH}?infraError=1`);
    }

    if (createEndpoint) {
        try {
            await managerCreateEndpoint({ name: endpointName, datafeed_id: datafeedId });
        } catch (err: unknown) {
            const reason = String(err).includes('already exists')
                ? `an endpoint named "${endpointName}" already exists`
                : 'a server error occurred';
            if (!String(err).includes('already exists')) console.error('createDatafeed: endpoint insert failed', err);
            fail(`Datafeed created, but the endpoint was not: ${reason}. You can create it from the datafeed page.`, `${DATAFEEDS_PATH}/${datafeedId}?error=`);
        }
    }

    redirect(`${DATAFEEDS_PATH}/${datafeedId}`);
}

// Creates an endpoint for an existing datafeed (retry path and the "connect endpoint" form).
export async function createEndpointFromDatafeed(formData: FormData) {
    await requireUser();
    const datafeedId = ((formData.get('datafeed_id') as string) ?? '').trim();
    const name = ((formData.get('endpoint_name') as string) ?? '').trim();
    const back = `${DATAFEEDS_PATH}/${encodeURIComponent(datafeedId)}?error=`;

    const nameError = validateName(name, 'Endpoint name');
    if (nameError) fail(nameError, back);
    try {
        await managerCreateEndpoint({ name, datafeed_id: datafeedId });
    } catch (err: unknown) {
        if (String(err).includes('already exists')) fail('An endpoint with that name already exists', back);
        console.error('createEndpointFromDatafeed: manager error', err);
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
        return (await managerListDatafeeds()).some((datafeed) => datafeed.name === name);
    } catch (err) {
        console.error('datafeedNameExists: database error', err);
        return null;
    }
}
