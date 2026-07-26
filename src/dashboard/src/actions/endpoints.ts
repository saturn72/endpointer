'use server';

import { redirect } from 'next/navigation';
import { randomUUID, createHash } from 'crypto';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { clientPromise, dbName } from '@/lib/mongodb';

// Wire in all format handlers — this import triggers the registry side-effects.
import './formats/registry';
import { getHandler, registeredExtensions, utf8CheckedStream, Utf8ValidationError } from './formats/index';

// Accepts letters, numbers, dashes, and underscores (one or more characters).
// Leading/trailing dashes and underscores are intentionally permitted —
// they are valid URL path-segment characters and may carry semantic meaning
// in feed names. Applied to both the endpoint name and the id_field.
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Hard cap on endpoint name length to prevent oversized index keys / URLs.
const MAX_ENDPOINT_NAME_LENGTH = 100;

// Maximum size enforced both via presigned-POST content-length-range policy and
// in finalizeUpload as defense-in-depth.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Presigned POST URLs expire after this many seconds. Long enough for a slow
// upload on a poor connection; short enough that a leaked URL is useless fast.
const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
});

// ─── Result types ─────────────────────────────────────────────────────────────

export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'xml' | 'json' | 'ini';

export type UploadResult =
    | { status: 'success' }
    | { status: 'error'; message: string }
    | { status: 'infra-error'; message: string };

export type GetUploadUrlResult =
    | { status: 'success'; url: string; fields: Record<string, string>; key: string; format: FileFormat }
    | { status: 'error'; message: string }
    | { status: 'infra-error'; message: string };

// ─── createEndpoint ───────────────────────────────────────────────────────────

export async function createEndpoint(formData: FormData) {
    const name = ((formData.get('name') as string) ?? '').trim();
    const idFieldRaw = ((formData.get('id_field') as string) ?? '').trim();
    const id_field = idFieldRaw || null;

    // ── Name validation ───────────────────────────────────────────────────────
    if (!name) {
        redirect(`/endpoints?error=${encodeURIComponent('Endpoint name is required')}`);
    }
    if (name.length > MAX_ENDPOINT_NAME_LENGTH) {
        redirect(
            `/endpoints?error=${encodeURIComponent(
                `Endpoint name must be ${MAX_ENDPOINT_NAME_LENGTH} characters or fewer`,
            )}`,
        );
    }
    if (!SAFE_NAME_PATTERN.test(name)) {
        redirect(
            `/endpoints?error=${encodeURIComponent(
                'Name must contain only letters, numbers, dashes, and underscores',
            )}`,
        );
    }

    // ── id_field validation ───────────────────────────────────────────────────
    // Apply the same safe-path-segment check: the field is used to look up a
    // column in uploaded CSVs, so arbitrary characters must not be accepted.
    if (id_field && !SAFE_NAME_PATTERN.test(id_field)) {
        redirect(
            `/endpoints?error=${encodeURIComponent(
                'ID field must contain only letters, numbers, dashes, and underscores',
            )}`,
        );
    }

    // ── Database insert ───────────────────────────────────────────────────────
    try {
        const client = await clientPromise;
        const db = client.db(dbName);
        await db.collection('endpoints').insertOne({
            name,
            id_field,
            created_at: new Date(),
        });
    } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) {
            // Unique index violation — two requests raced with the same name.
            // This is a validation error: surface the message to the user.
            redirect(
                `/endpoints?error=${encodeURIComponent('An endpoint with that name already exists')}`,
            );
        }
        // Any other DB failure (unreachable, timeout, etc.) — log server-side,
        // show a generic infra-error banner, never expose raw error details.
        console.error('createEndpoint: database error', err);
        redirect('/endpoints?infraError=1');
    }

    redirect(`/endpoints/${name}`);
}

// ─── getUploadUrl ─────────────────────────────────────────────────────────────
// Step 1 of the two-step upload flow. Validates the filename extension, verifies
// the endpoint still exists, generates a presigned POST URL scoped to an exact
// key, and returns it to the client. No file bytes are read here.

export async function getUploadUrl(
    endpointName: string,
    filename: string,
): Promise<GetUploadUrlResult> {
    // Extension check before any bytes move — quick UX feedback.
    // Accepted extensions are driven by the format handler registry so adding a
    // new handler in formats/registry.ts automatically extends the allowlist here.
    const ext = filename.split('.').pop()?.toLowerCase();
    const accepted = registeredExtensions(); // e.g. ['csv', 'xlsx', 'xls', 'xml']
    if (!ext || !accepted.includes(ext)) {
        const list = accepted.map((e) => `.${e}`).join(', ');
        return { status: 'error', message: `Only ${list} files are accepted` };
    }
    const format = ext as FileFormat;

    // Verify endpoint exists (endpoint-not-found race guard)
    try {
        const client = await clientPromise;
        const db = client.db(dbName);
        const exists = await db
            .collection('endpoints')
            .findOne({ name: endpointName }, { projection: { _id: 1 } });
        if (!exists) {
            return { status: 'error', message: 'Endpoint not found. It may have been deleted.' };
        }
    } catch (err) {
        console.error('getUploadUrl: database error', err);
        return {
            status: 'infra-error',
            message: 'Upload could not be prepared. Please try again.',
        };
    }

    // Generate object key using the same format as the previous upload flow
    const key = `${endpointName}/${randomUUID()}/${filename}`;

    try {
        const { url, fields } = await createPresignedPost(s3Client, {
            Bucket: process.env.S3_RAW_BUCKET!,
            Key: key, // exact key — no wildcard or prefix matching
            Conditions: [
                // 1-byte minimum at policy level replaces the old explicit zero-byte
                // check; finalizeUpload also checks as defense-in-depth.
                ['content-length-range', 1, MAX_UPLOAD_BYTES],
            ],
            Expires: PRESIGNED_URL_EXPIRY_SECONDS,
        });

        return { status: 'success', url, fields, key, format };
    } catch (err) {
        console.error('getUploadUrl: presigned POST generation failed', err);
        return {
            status: 'infra-error',
            message: 'Upload could not be prepared. Please try again.',
        };
    }
}

// ─── finalizeUpload ───────────────────────────────────────────────────────────
// Step 2 of the two-step upload flow. Retrieves the just-uploaded object from
// S3, runs all Step 0/0.1 validation rules via a format-specific parser, and
// issues a DeleteObjectCommand on any failure. The original validation error is
// returned to the client; delete failures are logged as a separate infra concern.

export async function finalizeUpload(
    endpointName: string,
    key: string,
    format: FileFormat,
): Promise<UploadResult> {
    // Re-verify endpoint (guards against deletion between getUploadUrl and here)
    let endpointDoc: { id_field?: unknown; last_upload_checksum?: string | null } | null = null;
    try {
        const client = await clientPromise;
        const db = client.db(dbName);
        endpointDoc = await db.collection<{ id_field?: unknown; last_upload_checksum?: string | null }>('endpoints').findOne({ name: endpointName });
    } catch (err) {
        console.error('finalizeUpload: database error', err);
        return {
            status: 'infra-error',
            message: 'Upload could not be verified. Please try again.',
        };
    }

    if (!endpointDoc) {
        return { status: 'error', message: 'Endpoint not found. It may have been deleted.' };
    }
    const id_field = (endpointDoc.id_field as string | null) ?? null;
    const storedChecksum = endpointDoc.last_upload_checksum ?? null;

    // Retrieve the uploaded object from S3
    let body: AsyncIterable<Uint8Array> | undefined;
    let contentLength: number | undefined;
    try {
        const response = await s3Client.send(
            new GetObjectCommand({
                Bucket: process.env.S3_RAW_BUCKET!,
                Key: key,
            }),
        );
        body = response.Body as unknown as AsyncIterable<Uint8Array> | undefined;
        contentLength = response.ContentLength;
    } catch (err) {
        console.error('finalizeUpload: S3 GetObject failed for key', key, err);
        return {
            status: 'infra-error',
            message: 'Upload verification failed. Please try again.',
        };
    }

    if (!body) {
        console.error('finalizeUpload: S3 response body missing for key', key);
        return { status: 'infra-error', message: 'Upload verification failed. Please try again.' };
    }

    // Zero-byte defense-in-depth: presigned POST policy's 1-byte minimum should
    // prevent this, but application logic must not trust policy enforcement alone.
    if (contentLength === 0) {
        await deleteObject(key);
        return { status: 'error', message: 'File is empty' };
    }

    // Buffer all bytes so we can (a) compute a checksum and (b) hand the same
    // bytes to the format-specific header parser without re-fetching from S3.
    // The 10 MB cap enforced by the presigned POST policy bounds memory use here.
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
        chunks.push(Buffer.from(chunk));
    }
    const allBytes = Buffer.concat(chunks);

    // ── Duplicate-upload check ────────────────────────────────────────────────
    const newChecksum = createHash('sha256').update(allBytes).digest('hex');
    if (storedChecksum !== null && storedChecksum === newChecksum) {
        await deleteObject(key);
        return {
            status: 'error',
            message: 'This file is identical to the current version — no new version was created.',
        };
    }

    // ── Format-specific header parsing via the handler registry ─────────────
    // getHandler() is guaranteed to return a handler here because getUploadUrl
    // already validated the extension against the same registry. If it somehow
    // returns undefined (programming error), treat as infra error.
    const handler = getHandler(format);
    if (!handler) {
        console.error('finalizeUpload: no handler registered for format', format);
        return { status: 'infra-error', message: 'Upload verification failed. Please try again.' };
    }

    // Re-create an AsyncIterable from the buffered bytes so the header parser
    // gets a fresh stream (the original S3 body has already been consumed above).
    async function* fromBuffer(buf: Buffer): AsyncIterable<Uint8Array> {
        yield buf;
    }
    const bufferedStream = fromBuffer(allBytes);

    // Wrap the stream with a UTF-8 checker for text-based formats.
    // The wrapper is transparent — it passes chunks through unchanged but throws
    // Utf8ValidationError on the first invalid byte sequence.
    const streamToUse = handler.supportsEncodingCheck ? utf8CheckedStream(bufferedStream) : bufferedStream;

    let parseResult: { headers: string[] } | { error: string };
    try {
        parseResult = await handler.getHeaderRow(streamToUse);
    } catch (err) {
        if (err instanceof Utf8ValidationError) {
            await deleteObject(key);
            return { status: 'error', message: err.message };
        }
        console.error('finalizeUpload: error parsing uploaded file', key, err);
        await deleteObject(key);
        return { status: 'infra-error', message: 'Upload verification failed. Please try again.' };
    }

    if ('error' in parseResult) {
        await deleteObject(key);
        return { status: 'error', message: parseResult.error };
    }

    const { headers: trimmedHeaders } = parseResult;

    // ── Header validation rules (same for all formats) ────────────────────────
    let validationError: string | null = null;
    if (!trimmedHeaders.length || trimmedHeaders.every((h) => !h)) {
        // All columns are empty/whitespace (e.g. no worksheets, or stray comma).
        validationError = 'File must have a non-empty header row';
    } else if (new Set(trimmedHeaders).size !== trimmedHeaders.length) {
        // Duplicate column names — case-sensitive exact match after trim.
        validationError = 'Header row contains duplicate column names';
    } else if (id_field && !trimmedHeaders.includes(id_field)) {
        validationError = `Uploaded file is missing the configured id column: ${id_field}`;
    }

    if (validationError) {
        await deleteObject(key);
        return { status: 'error', message: validationError };
    }

    // ── Persist checksum for future duplicate detection ───────────────────────
    // Best-effort: a failure here is logged but does not fail the upload itself.
    // The file has already been accepted and stored; losing the checksum just
    // means one duplicate could slip through until the next successful write.
    try {
        const client = await clientPromise;
        const db = client.db(dbName);
        await db.collection('endpoints').updateOne(
            { name: endpointName },
            { $set: { last_upload_checksum: newChecksum } },
        );
    } catch (err) {
        console.error('finalizeUpload: failed to persist checksum', err);
    }

    return { status: 'success' };
}

// ─── setVersionPublished ──────────────────────────────────────────────────────
// Toggles the `published` flag on a specific version document.
// Called by the PublishToggle client component on the version detail page.

export async function setVersionPublished(
    endpointName: string,
    major: number,
    minor: number,
    published: boolean,
): Promise<void> {
    try {
        const client = await clientPromise;
        const db = client.db(dbName);
        await db.collection('versions').updateOne(
            { endpoint_name: endpointName, major, minor },
            { $set: { published } },
        );
    } catch (err) {
        console.error('setVersionPublished: database error', err);
        throw new Error('Failed to update publish status. Please try again.');
    }
}

// ─── deleteObject ─────────────────────────────────────────────────────────────
// Best-effort S3 delete used by finalizeUpload for compensating-action cleanup.
// Logs failure but never throws — callers surface the original error regardless.

async function deleteObject(key: string): Promise<void> {
    try {
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: process.env.S3_RAW_BUCKET!,
                Key: key,
            }),
        );
    } catch (err) {
        console.error('deleteObject: failed to remove invalid object', key, err);
    }
}
