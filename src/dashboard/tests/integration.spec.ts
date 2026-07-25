/**
 * Comprehensive regression test suite — FeedHub Admin (Steps 0 – 0.6)
 *
 * Runs against a live Next.js dev server backed by a local MongoDB + SeaweedFS
 * docker-compose stack.  Every test creates its own uniquely-named resources
 * and cleans up after itself, so tests are fully isolated and order-independent.
 *
 * Groups
 *   1 · Dashboard – Listing
 *   2 · Dashboard – Create Endpoint
 *   3 · Endpoint Detail – Page Load
 *   4 · Upload – Happy Path
 *   5 · Upload – Rejected Before Finalize
 *   6 · Upload – Rejected at Finalize (CSV / XLSX / XLS)
 *   7 · Upload – Infra Failure Paths
 *   8 · Error-Class Consistency (cross-cutting)
 *   9 · XML Format Support
 *  10 · Format Registry (unit test)
 *  11 · JSON Format Support
 *  12 · INI Format Support
 *  13 · Duplicate Upload Detection
 */

import { test, expect, type Page } from '@playwright/test';
import {
    S3Client,
    HeadObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';
import * as XLSX from 'xlsx';

// ── Infrastructure config ─────────────────────────────────────────────────────

const S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:8333';
const BUCKET = process.env.S3_RAW_BUCKET ?? 'raw';
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGODB_DB ?? 'endpointer';

const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'test-key',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'test-secret',
    },
    forcePathStyle: true,
});

// ── UID ───────────────────────────────────────────────────────────────────────

const uid = () => `ep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ── Cleanup helpers ───────────────────────────────────────────────────────────

async function deleteEndpoint(name: string): Promise<void> {
    const mongo = new MongoClient(MONGO_URI);
    try {
        await mongo.connect();
        await mongo.db(MONGO_DB).collection('endpoints').deleteOne({ name });
    } finally {
        await mongo.close();
    }
}

async function deleteS3Prefix(prefix: string): Promise<void> {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
    const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) {
        await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys } }));
    }
}

async function assertS3KeyGone(key: string | null): Promise<void> {
    if (!key) return;
    await expect(async () => {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    }).rejects.toThrow();
}

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeXlsx(headers: string[], rows: string[][] = []): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function makeXls(headers: string[], rows: string[][] = []): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xls' }));
}

// ── UI helpers ────────────────────────────────────────────────────────────────

/**
 * Create an endpoint via the sheet UI and land on its detail page.
 * Optionally set id_field.
 */
async function createEndpointViaUi(page: Page, name: string, idField?: string): Promise<void> {
    await page.goto('/endpoints');
    await page.getByRole('button', { name: 'New Endpoint' }).first().click();
    await page.locator('input[name="name"]').fill(name);
    if (idField) await page.locator('input[name="id_field"]').fill(idField);
    await page.getByRole('button', { name: 'Create' }).click();
    // createEndpoint now redirects directly to the endpoint detail page.
    await expect(page).toHaveURL(`/endpoints/${name}`);
}

/**
 * Register a route handler that records the S3 object key from the presigned
 * POST multipart body.  Returns a ref whose `.value` is populated after the
 * upload fires.  Must be called BEFORE triggering the upload.
 */
async function captureS3Key(page: Page): Promise<{ value: string | null }> {
    const ref: { value: string | null } = { value: null };
    await page.route(`${S3_ENDPOINT}/**`, async (route, request) => {
        if (request.method() === 'POST') {
            const body = request.postDataBuffer();
            if (body) {
                const m = body.toString().match(/name="key"\r\n\r\n([^\r\n]+)/);
                if (m) ref.value = m[1];
            }
        }
        await route.continue();
    });
    return ref;
}

// ════════════════════════════════════════════════════════════════════════════════
// 1 · DASHBOARD — LISTING
// ════════════════════════════════════════════════════════════════════════════════

test.describe('1 · Dashboard – Listing', () => {
    test('empty state — dashboard loads without endpoints and does not crash', async ({ page }) => {
        await page.goto('/');
        await expect(page).not.toHaveURL(/error/);
        // Stats card is present even with zero endpoints
        await expect(page.getByText('Total Endpoints')).toBeVisible();
    });

    test('lists an existing endpoint — name link visible on /endpoints', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        await page.goto('/endpoints');
        await expect(page.locator(`a[href="/endpoints/${name}"]`)).toBeVisible();
        await deleteEndpoint(name);
    });

    test('infra-error banner shown when ?infraError=1 — create button still accessible', async ({ page }) => {
        // createEndpoint redirects here on non-duplicate Mongo errors.
        // Navigating directly verifies the infra-error banner renders without crashing.
        await page.goto('/endpoints?infraError=1');
        const alert = page.locator('[role="alert"]');
        await expect(alert).toBeVisible();
        await expect(alert).toHaveClass(/bg-amber-50/);
        // Create form must still be accessible despite the error banner
        await expect(page.getByRole('button', { name: 'New Endpoint' }).first()).toBeVisible();
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 2 · DASHBOARD — CREATE ENDPOINT
// ════════════════════════════════════════════════════════════════════════════════

test.describe('2 · Dashboard – Create Endpoint', () => {
    test('valid name-only creation succeeds → redirect to /endpoints', async ({ page }) => {
        const name = uid();
        await page.goto('/endpoints');
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill(name);
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL('/endpoints');
        await expect(page.locator(`a[href="/endpoints/${name}"]`)).toBeVisible();
        await deleteEndpoint(name);
    });

    test('valid name + id_field creation succeeds → id_field visible on detail page', async ({ page }) => {
        const name = uid();
        await page.goto('/endpoints');
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill(name);
        await page.locator('input[name="id_field"]').fill('sku');
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL('/endpoints');
        await page.click(`a[href="/endpoints/${name}"]`);
        await expect(page.getByText('sku')).toBeVisible();
        await deleteEndpoint(name);
    });

    test('duplicate name → specific validation message, not generic error', async ({ page }) => {
        const name = uid();
        // First creation
        await page.goto('/endpoints');
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill(name);
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL('/endpoints');
        // Duplicate creation
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill(name);
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL(/error=/);
        await expect(page.locator('[role="alert"]')).toContainText('already exists');
        // Must be red validation, not amber infra
        await expect(page.locator('[role="alert"]')).not.toHaveClass(/bg-amber-50/);
        await deleteEndpoint(name);
    });

    test('whitespace-only name is rejected', async ({ page }) => {
        await page.goto('/endpoints');
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill('   ');
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL(/error=/);
    });

    test('name exceeding MAX_ENDPOINT_NAME_LENGTH (100) is rejected', async ({ page }) => {
        const longName = 'a'.repeat(101);
        await page.goto('/endpoints');
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill(longName);
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL(/error=/);
        await expect(page.locator('[role="alert"]')).toContainText('100');
    });

    test('name with unsafe characters (SAFE_NAME_PATTERN) is rejected', async ({ page }) => {
        // SAFE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/ — spaces and special chars not allowed
        await page.goto('/endpoints');
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill('bad name!');
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL(/error=/);
    });

    test('id_field with unsafe characters is rejected', async ({ page }) => {
        const name = uid();
        await page.goto('/endpoints');
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill(name);
        await page.locator('input[name="id_field"]').fill('bad field!');
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL(/error=/);
    });

    test('infra-error banner shown (via ?infraError=1) while create form stays accessible', async ({ page }) => {
        await page.goto('/endpoints?infraError=1');
        await expect(page.locator('[role="alert"]')).toHaveClass(/bg-amber-50/);
        await expect(page.getByRole('button', { name: 'New Endpoint' }).first()).toBeVisible();
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 3 · ENDPOINT DETAIL — PAGE LOAD
// ════════════════════════════════════════════════════════════════════════════════

test.describe('3 · Endpoint Detail – Page Load', () => {
    test('existing endpoint displays name and id_field on detail page', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name, 'product_id');
        await expect(page.getByText(name)).toBeVisible();
        await expect(page.getByText('product_id')).toBeVisible();
        await deleteEndpoint(name);
    });

    test('endpoint with no id_field shows "none configured"', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        await expect(page.getByText(/none configured/i)).toBeVisible();
        await deleteEndpoint(name);
    });

    test('non-existent endpoint name returns 404', async ({ page }) => {
        const response = await page.goto('/endpoints/does-not-exist-xyz-9999');
        expect(response?.status()).toBe(404);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 4 · UPLOAD — HAPPY PATH
// ════════════════════════════════════════════════════════════════════════════════

test.describe('4 · Upload – Happy Path', () => {
    async function assertUploadSucceeds(
        page: Page,
        name: string,
        filename: string,
        mimeType: string,
        buffer: Buffer,
    ): Promise<string | null> {
        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({ name: filename, mimeType, buffer });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[role="alert"]')).toContainText('successfully');
        // Object must still exist in S3 (not removed on success)
        if (keyRef.value) {
            await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyRef.value }));
        }
        return keyRef.value;
    }

    test('valid .csv — success banner + object exists in S3 at expected key prefix', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await assertUploadSucceeds(page, name, 'data.csv', 'text/csv',
            Buffer.from('id,name\n1,Alice'));
        // Key must be scoped under the endpoint name
        if (key) expect(key).toMatch(new RegExp(`^${name}/`));
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('valid .xlsx — success banner + object exists in S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await assertUploadSucceeds(page, name, 'data.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            makeXlsx(['id', 'name'], [['1', 'Alice']]));
        if (key) expect(key).toMatch(new RegExp(`^${name}/`));
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('valid .xls — success banner + object exists in S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await assertUploadSucceeds(page, name, 'data.xls', 'application/vnd.ms-excel',
            makeXls(['id', 'name'], [['1', 'Alice']]));
        if (key) expect(key).toMatch(new RegExp(`^${name}/`));
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('upload to endpoint WITH id_field — file containing that column succeeds', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name, 'sku');
        const key = await assertUploadSucceeds(page, name, 'products.csv', 'text/csv',
            Buffer.from('sku,title\nA1,Widget'));
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
        void key;
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 5 · UPLOAD — REJECTED BEFORE FINALIZE
// ════════════════════════════════════════════════════════════════════════════════

test.describe('5 · Upload – Rejected Before Finalize', () => {
    test('unsupported extension (.txt) rejected by getUploadUrl — S3 never called', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        let s3PostCalled = false;
        await page.route(`${S3_ENDPOINT}/**`, async (route, request) => {
            if (request.method() === 'POST') s3PostCalled = true;
            await route.continue();
        });

        await page.locator('input[type="file"]').setInputFiles({
            name: 'data.txt', mimeType: 'text/plain', buffer: Buffer.from('id,name\n1,Alice'),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('[role="alert"]')).toContainText('.csv');
        expect(s3PostCalled).toBe(false); // bytes never reached S3
        await deleteEndpoint(name);
    });

    test('oversized file rejected by presigned POST policy (HTTP error from S3)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        // 11 MB > 10 MB content-length-range limit
        const header = Buffer.from('id,name\n');
        const padding = Buffer.alloc(11 * 1024 * 1024, 97 /* 'a' */);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.concat([header, padding]),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        await deleteEndpoint(name);
    });

    test('getUploadUrl for a deleted endpoint returns a clear error', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        await deleteEndpoint(name); // delete before the upload is triggered

        await page.locator('input[type="file"]').setInputFiles({
            name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('id,name\n1,Alice'),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('[role="alert"]')).toContainText('not found');
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 6 · UPLOAD — REJECTED AT FINALIZE
// ════════════════════════════════════════════════════════════════════════════════

test.describe('6 · Upload – Rejected at Finalize', () => {
    /**
     * Upload a file, assert the alert contains expectedText, and that it renders
     * as a validation error (red, not amber).  Returns the S3 key.
     */
    async function uploadExpectValidationError(
        page: Page,
        name: string,
        filename: string,
        mimeType: string,
        buffer: Buffer,
        expectedText: string,
    ): Promise<string | null> {
        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
        const alert = page.locator('[role="alert"]');
        await expect(alert).toBeVisible({ timeout: 20_000 });
        await expect(alert).toContainText(expectedText);
        // Validation error (red), not infra (amber)
        await expect(alert).not.toHaveClass(/bg-amber-50/);
        return keyRef.value;
    }

    // ── CSV ───────────────────────────────────────────────────────────────────

    test('CSV · zero-byte file is rejected (policy or finalizeUpload)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        // Either rejected by S3 policy or caught by finalizeUpload zero-byte check
        if (keyRef.value) await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
    });

    test('CSV · empty header row rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await uploadExpectValidationError(page, name, 'bad.csv', 'text/csv',
            Buffer.from(',\n1,2'), 'non-empty header');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('CSV · whitespace-only column names rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await uploadExpectValidationError(page, name, 'ws.csv', 'text/csv',
            Buffer.from('  ,  \n1,2'), 'non-empty header');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('CSV · duplicate column names rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await uploadExpectValidationError(page, name, 'dup.csv', 'text/csv',
            Buffer.from('col,col\n1,2'), 'duplicate');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('CSV · missing id_field column rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name, 'sku');
        const key = await uploadExpectValidationError(page, name, 'no_id.csv', 'text/csv',
            Buffer.from('id,name\n1,Alice'), 'sku');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('CSV · non-UTF-8 (Latin-1) file rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        // Latin-1 bytes 0xE9 0xE8 are invalid in strict UTF-8
        const latin1 = Buffer.from([
            0x63, 0x6f, 0x6c, 0x31, 0x2c, 0x63, 0x6f, 0x6c, 0x32, 0x0a, // "col1,col2\n"
            0xe9, 0xe8, 0x0a,                                               // Latin-1 "éè\n"
        ]);
        const key = await uploadExpectValidationError(page, name, 'latin1.csv', 'text/csv',
            latin1, 'UTF-8');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('CSV · corrupted binary content surfaces error, not crash', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'corrupt.csv', mimeType: 'text/csv',
            buffer: Buffer.from([0x00, 0x01, 0x80, 0x81, 0xff]),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        if (keyRef.value) await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    // ── XLSX ──────────────────────────────────────────────────────────────────

    test('XLSX · empty header row rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await uploadExpectValidationError(page, name, 'empty.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            makeXlsx(['', '']), 'non-empty header');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XLSX · zero worksheets rejected + object deleted from S3', async ({ page }) => {
        const wb = XLSX.utils.book_new(); // workbook with no sheets
        const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await uploadExpectValidationError(page, name, 'nosheets.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buf, 'non-empty header');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XLSX · duplicate column names rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await uploadExpectValidationError(page, name, 'dup.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            makeXlsx(['col', 'col']), 'duplicate');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XLSX · missing id_field column rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name, 'sku');
        const key = await uploadExpectValidationError(page, name, 'no_id.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            makeXlsx(['id', 'name']), 'sku');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XLSX · corrupted file surfaces validation error (not crash)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'corrupt.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            buffer: Buffer.from('not a zip file at all'),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        if (keyRef.value) await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    // ── XLS ───────────────────────────────────────────────────────────────────

    test('XLS · empty header row rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await uploadExpectValidationError(page, name, 'empty.xls',
            'application/vnd.ms-excel', makeXls(['', '']), 'non-empty header');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XLS · duplicate column names rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const key = await uploadExpectValidationError(page, name, 'dup.xls',
            'application/vnd.ms-excel', makeXls(['col', 'col']), 'duplicate');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XLS · missing id_field column rejected + object deleted from S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name, 'sku');
        const key = await uploadExpectValidationError(page, name, 'no_id.xls',
            'application/vnd.ms-excel', makeXls(['id', 'name']), 'sku');
        await assertS3KeyGone(key);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XLS · corrupted file surfaces validation error (not crash)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);
        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'corrupt.xls', mimeType: 'application/vnd.ms-excel',
            buffer: Buffer.from('not an OLE2 file at all'),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        if (keyRef.value) await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 7 · UPLOAD — INFRA FAILURE PATHS
// ════════════════════════════════════════════════════════════════════════════════

test.describe('7 · Upload – Infra Failure Paths', () => {
    test('key never uploaded → finalizeUpload returns infra-error (not validation)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        // Return fake 204: browser thinks upload succeeded, but no object is in S3
        await page.route(`${S3_ENDPOINT}/**`, async (route, request) => {
            if (request.method() === 'POST') await route.fulfill({ status: 204, body: '' });
            else await route.continue();
        });

        await page.locator('input[type="file"]').setInputFiles({
            name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('id,name\n1,Alice'),
        });
        const alert = page.locator('[role="alert"]');
        await expect(alert).toBeVisible({ timeout: 15_000 });
        await expect(alert).not.toContainText('successfully');
        // Infra (amber), not validation (red)
        await expect(alert).toHaveClass(/bg-amber-50/);
        await deleteEndpoint(name);
    });

    test('SeaweedFS GetObject failure during finalizeUpload → infra-error banner', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        let uploadPosted = false;
        await page.route(`${S3_ENDPOINT}/**`, async (route, request) => {
            if (request.method() === 'POST') {
                await route.continue();
                uploadPosted = true;
            } else if (request.method() === 'GET' && uploadPosted) {
                // Simulate S3 read failure for the GetObject in finalizeUpload
                await route.fulfill({ status: 500, body: 'Internal Server Error' });
            } else {
                await route.continue();
            }
        });

        await page.locator('input[type="file"]').setInputFiles({
            name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('id,name\n1,Alice'),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[role="alert"]')).toHaveClass(/bg-amber-50/);
        await deleteEndpoint(name);
    });

    test('endpoint deleted between getUploadUrl and finalizeUpload → clear error', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        let uploadPosted = false;
        await page.route(`${S3_ENDPOINT}/**`, async (route, request) => {
            if (request.method() === 'POST') {
                await route.continue();
                uploadPosted = true;
            } else {
                await route.continue();
            }
        });

        // Delete the endpoint from MongoDB as soon as the S3 POST response arrives
        page.on('response', async (resp) => {
            if (uploadPosted && resp.url().includes(S3_ENDPOINT.replace('http://', ''))) {
                uploadPosted = false; // prevent duplicate deletes
                await deleteEndpoint(name);
            }
        });

        await page.locator('input[type="file"]').setInputFiles({
            name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('id,name\n1,Alice'),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('deleted');
    });

    test('DeleteObject failure during validation rejection → user receives validation error', async ({ page }) => {
        // If S3 delete fails after a validation rejection, the user-facing banner must
        // still be the original validation error (not an infra error).  The delete failure
        // is a server-side concern logged separately.
        const name = uid();
        await createEndpointViaUi(page, name);

        let uploadedKey: string | null = null;
        await page.route(`${S3_ENDPOINT}/**`, async (route, request) => {
            if (request.method() === 'POST') {
                const body = request.postDataBuffer();
                if (body) {
                    const m = body.toString().match(/name="key"\r\n\r\n([^\r\n]+)/);
                    if (m) uploadedKey = m[1];
                }
                await route.continue();
            } else if (request.method() === 'DELETE') {
                // Simulate delete failure
                await route.fulfill({ status: 500, body: 'Delete failed' });
            } else {
                await route.continue();
            }
        });

        await page.locator('input[type="file"]').setInputFiles({
            name: 'dup.csv', mimeType: 'text/csv', buffer: Buffer.from('col,col\n1,2'),
        });
        const alert = page.locator('[role="alert"]');
        await expect(alert).toBeVisible({ timeout: 15_000 });
        await expect(alert).toContainText('duplicate');   // original validation error
        await expect(alert).not.toHaveClass(/bg-amber-50/); // NOT an infra error

        // Manual cleanup (delete was intercepted)
        if (uploadedKey) await deleteS3Prefix(name);
        await deleteEndpoint(name);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 8 · ERROR-CLASS CONSISTENCY
// ════════════════════════════════════════════════════════════════════════════════

test.describe('8 · Error-Class Consistency', () => {
    test('validation errors red/destructive; infra errors amber — visually distinct', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        // ── Validation error (upload): duplicate column headers ───────────────
        await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'dup.csv', mimeType: 'text/csv', buffer: Buffer.from('col,col\n1,2'),
        });
        const validationAlert = page.locator('[role="alert"]');
        await expect(validationAlert).toBeVisible({ timeout: 15_000 });
        await expect(validationAlert).toHaveClass(/text-destructive/);  // red
        await expect(validationAlert).not.toHaveClass(/bg-amber-50/);   // not amber

        // ── Infra error (endpoint page): ?infraError=1 ────────────────────────
        await page.goto('/endpoints?infraError=1');
        const infraAlert = page.locator('[role="alert"]');
        await expect(infraAlert).toBeVisible();
        await expect(infraAlert).toHaveClass(/bg-amber-50/);            // amber
        await expect(infraAlert).not.toHaveClass(/text-destructive/);   // not red

        // ── Validation error (create): duplicate endpoint name ────────────────
        await page.goto('/endpoints');
        await page.getByRole('button', { name: 'New Endpoint' }).first().click();
        await page.locator('input[name="name"]').fill(name);
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL(/error=/);
        await expect(page.locator('[role="alert"]')).not.toHaveClass(/bg-amber-50/);

        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('infra-error HTML never exposes raw error messages or stack traces', async ({ page }) => {
        await page.goto('/endpoints?infraError=1');
        const html = await page.content();

        // MongoDB driver error class names must not appear in rendered HTML
        expect(html).not.toMatch(/MongoServerError|MongoNetworkError|MongoError/);
        // System error codes
        expect(html).not.toMatch(/ECONNREFUSED|ENOTFOUND|ECONNRESET/);
        // Stack trace frames: "  at FunctionName (file.js:42:7)"
        expect(html).not.toMatch(/\s+at\s+\w[\w.]*\s+\([^)]+\.js:\d+:\d+\)/);
        // MongoDB connection string leak
        expect(html).not.toMatch(/mongodb:\/\//);
        // AWS SDK error class names
        expect(html).not.toMatch(/NoSuchKey|S3ServiceException|RequestError/);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 9 · XML FORMAT SUPPORT (Step 0.5 / Part B)
// ════════════════════════════════════════════════════════════════════════════════
//
// XML structural assumption (revisitable):
//   Root element → repeated record child elements → each record's child tag names
//   are the "header".  Attributes are ignored.  Only the first record is inspected.
//   Namespace prefixes are stripped before comparison.

function xmlBuf(content: string): Buffer {
    return Buffer.from(content, 'utf-8');
}

test.describe('9 · XML Format Support', () => {
    test('valid XML upload succeeds end-to-end — success banner + object exists in S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'feed.xml',
            mimeType: 'application/xml',
            buffer: xmlBuf(
                `<?xml version="1.0" encoding="UTF-8"?>
<feed>
  <record><id>1</id><name>Alice</name><value>42</value></record>
  <record><id>2</id><name>Bob</name><value>99</value></record>
</feed>`,
            ),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[role="alert"]')).toContainText('successfully');

        // Object must exist in S3 at key scoped under the endpoint name
        if (keyRef.value) {
            await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyRef.value }));
            expect(keyRef.value).toMatch(new RegExp(`^${name}/`));
        }

        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XML with zero root children (no records) is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'empty.xml',
            mimeType: 'application/xml',
            buffer: xmlBuf('<feed></feed>'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('non-empty header');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XML first record has zero children is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'nofields.xml',
            mimeType: 'application/xml',
            buffer: xmlBuf('<feed><record></record></feed>'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('non-empty header');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XML duplicate child tag names in first record rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'dup.xml',
            mimeType: 'application/xml',
            buffer: xmlBuf('<feed><record><col>a</col><col>b</col></record></feed>'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('duplicate');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XML missing configured id_field tag rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name, 'sku');

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'no_id.xml',
            mimeType: 'application/xml',
            buffer: xmlBuf('<feed><record><id>1</id><name>Alice</name></record></feed>'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('sku');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('malformed XML rejected as validation error (not crash)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'bad.xml',
            mimeType: 'application/xml',
            buffer: xmlBuf('<feed><record><id>1</id></record'), // unclosed tag
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        // Must be error (any type), not a crash / missing alert
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('non-UTF-8 XML file is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        // Inject invalid UTF-8 bytes into an otherwise valid XML structure
        const prefix = Buffer.from('<feed><record><id>');
        const invalid = Buffer.from([0xe9, 0xe8]); // Latin-1 bytes, invalid UTF-8
        const suffix = Buffer.from('</id></record></feed>');

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'latin1.xml',
            mimeType: 'application/xml',
            buffer: Buffer.concat([prefix, invalid, suffix]),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('UTF-8');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('XML validation failure deletes the S3 object (delete-on-failure applies)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        // Duplicate tag names will trigger the delete-on-failure path
        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'dup2.xml',
            mimeType: 'application/xml',
            buffer: xmlBuf('<feed><record><x>1</x><x>2</x></record></feed>'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('duplicate');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    // Whitespace-only XML tag names note:
    // XML 1.0 prohibits whitespace-only element names at the syntax level (a name
    // must start with a letter or underscore).  Well-formed XML cannot have a tag
    // named "   ".  This case is therefore marked N/A for XML — the SAX parser
    // itself would reject such a document as malformed before our validation runs.
});

// ════════════════════════════════════════════════════════════════════════════════
// 10 · FORMAT REGISTRY (abstraction unit test — no browser needed)
// ════════════════════════════════════════════════════════════════════════════════

test.describe('10 · Format Registry', () => {
    test('all six handlers are registered and keyed by extension', async () => {
        // Dynamic import of the server-side registry module.  Playwright tests run in
        // Node.js so this is a direct module import, not a browser fetch.
        // The registry side-effects fire on first import (handled by registry.ts).
        const { getHandler, registeredExtensions } = await import(
            '../src/actions/formats/index.js'
        );

        const exts = registeredExtensions() as string[];
        expect(exts).toContain('csv');
        expect(exts).toContain('xlsx');
        expect(exts).toContain('xls');
        expect(exts).toContain('xml');
        expect(exts).toContain('json');
        expect(exts).toContain('ini');

        expect(getHandler('csv')).toBeDefined();
        expect(getHandler('xlsx')).toBeDefined();
        expect(getHandler('xls')).toBeDefined();
        expect(getHandler('xml')).toBeDefined();
        expect(getHandler('json')).toBeDefined();
        expect(getHandler('ini')).toBeDefined();

        // Extension lookup must be case-insensitive and accept leading dots
        expect(getHandler('.CSV')).toBeDefined();
        expect(getHandler('.Xml')).toBeDefined();
        expect(getHandler('.JSON')).toBeDefined();
        expect(getHandler('.INI')).toBeDefined();
        expect(getHandler('xml')).toBeDefined();

        // Extension lookup must be case-insensitive and accept leading dots
        expect(getHandler('.CSV')).toBeDefined();
        expect(getHandler('.Xml')).toBeDefined();
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 11 · JSON FORMAT SUPPORT (Step 0.6 / Part A)
// ════════════════════════════════════════════════════════════════════════════════
//
// JSON structural assumption (revisitable):
//   Top-level array of objects.  Header = keys of first element only.
//   Rejects: non-array root, empty array, first element not an object or empty.
//   Duplicate keys in a JSON object are technically spec-allowed but have
//   implementation-defined behavior; V8/stream-json keep the last value.
//   The shared duplicate-header check still runs for consistency.

function jsonBuf(content: string): Buffer {
    return Buffer.from(content, 'utf-8');
}

test.describe('11 · JSON Format Support', () => {
    test('valid JSON upload succeeds end-to-end — success banner + object exists in S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'feed.json',
            mimeType: 'application/json',
            buffer: jsonBuf(JSON.stringify([
                { id: '1', name: 'Alice', value: '42' },
                { id: '2', name: 'Bob', value: '99' },
            ])),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[role="alert"]')).toContainText('successfully');

        if (keyRef.value) {
            await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyRef.value }));
            expect(keyRef.value).toMatch(new RegExp(`^${name}/`));
        }

        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('JSON empty array is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'empty.json',
            mimeType: 'application/json',
            buffer: jsonBuf('[]'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('non-empty header');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('JSON first element is empty object {} is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'emptyobj.json',
            mimeType: 'application/json',
            buffer: jsonBuf('[{}]'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('non-empty header');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('JSON first element is not an object (array of scalars) is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'scalar.json',
            mimeType: 'application/json',
            buffer: jsonBuf('["not", "an", "object"]'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    // Duplicate key note: JSON objects cannot structurally have duplicate keys in
    // the sense that a conformant parser will either reject or silently deduplicate
    // them.  stream-json keeps the last value for a duplicated key, so by the time
    // we call Object.keys() the duplicate is already gone.  This case is therefore
    // not testable as a "duplicate column" rejection at the handler level, and is
    // documented here rather than tested.

    test('JSON whitespace-only key name is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        // Use a raw string so the whitespace key is preserved (JSON.stringify would keep it)
        await page.locator('input[type="file"]').setInputFiles({
            name: 'wskey.json',
            mimeType: 'application/json',
            buffer: jsonBuf('[{"   ": "value", "id": "1"}]'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('non-empty header');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('JSON missing configured id_field key is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name, 'sku');

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'no_id.json',
            mimeType: 'application/json',
            buffer: jsonBuf('[{"id": "1", "name": "Alice"}]'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('sku');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('malformed JSON rejected as validation error (not crash)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'bad.json',
            mimeType: 'application/json',
            buffer: jsonBuf('[{"id": 1, "name": "Alice"'), // unclosed JSON
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('non-UTF-8 JSON file is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const prefix = Buffer.from('[{"id":"');
        const invalid = Buffer.from([0xe9, 0xe8]); // Latin-1 bytes, invalid UTF-8
        const suffix = Buffer.from('"}]');

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'latin1.json',
            mimeType: 'application/json',
            buffer: Buffer.concat([prefix, invalid, suffix]),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('UTF-8');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('JSON validation failure deletes the S3 object (delete-on-failure applies)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'empty2.json',
            mimeType: 'application/json',
            buffer: jsonBuf('[]'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 12 · INI FORMAT SUPPORT (Step 0.6 / Part B)
// ════════════════════════════════════════════════════════════════════════════════
//
// INI structural assumption (revisitable — loosest tabular fit of all formats):
//   Each [section] = one record.  Header = keys of first section only.
//   Flat key=value files (no sections) treated as a single implicit record.
//   Comments (; or #) and blank lines are ignored.
//   Malformed lines (non-comment, non-section, no =) are validation errors.

function iniBuf(content: string): Buffer {
    return Buffer.from(content, 'utf-8');
}

test.describe('12 · INI Format Support', () => {
    test('valid INI upload (sectioned) succeeds end-to-end — success banner + object in S3', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'feed.ini',
            mimeType: 'text/plain',
            buffer: iniBuf('[record1]\nid=1\nname=Alice\n\n[record2]\nid=2\nname=Bob\n'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[role="alert"]')).toContainText('successfully');

        if (keyRef.value) {
            await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: keyRef.value }));
            expect(keyRef.value).toMatch(new RegExp(`^${name}/`));
        }

        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('valid INI upload (flat / no sections) succeeds end-to-end', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'flat.ini',
            mimeType: 'text/plain',
            buffer: iniBuf('id=1\nname=Alice\n'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('[role="alert"]')).toContainText('successfully');

        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('INI first section has zero key=value lines is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'empty_section.ini',
            mimeType: 'text/plain',
            buffer: iniBuf('[record1]\n\n[record2]\nid=1\n'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('non-empty header');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('INI duplicate keys in first section rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'dup.ini',
            mimeType: 'text/plain',
            buffer: iniBuf('[record1]\ncol=a\ncol=b\n'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('duplicate');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('INI whitespace-only key name is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'wskey.ini',
            mimeType: 'text/plain',
            buffer: iniBuf('[record1]\n   =value\nid=1\n'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('non-empty header');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('INI missing configured id_field key is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name, 'sku');

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'no_id.ini',
            mimeType: 'text/plain',
            buffer: iniBuf('[record1]\nid=1\nname=Alice\n'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('sku');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('malformed INI (line with no = sign) rejected as validation error (not crash)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'bad.ini',
            mimeType: 'text/plain',
            buffer: iniBuf('[record1]\nthis line has no equals sign\nid=1\n'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).not.toContainText('successfully');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('non-UTF-8 INI file is rejected + object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const prefix = Buffer.from('[record1]\nid=');
        const invalid = Buffer.from([0xe9, 0xe8]); // Latin-1 bytes, invalid UTF-8
        const suffix = Buffer.from('\nname=Alice\n');

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'latin1.ini',
            mimeType: 'text/plain',
            buffer: Buffer.concat([prefix, invalid, suffix]),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('UTF-8');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('INI validation failure deletes the S3 object (delete-on-failure applies)', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const keyRef = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'dup2.ini',
            mimeType: 'text/plain',
            buffer: iniBuf('[record1]\ncol=a\ncol=b\n'),
        });

        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('duplicate');
        await assertS3KeyGone(keyRef.value);
        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// 13 · DUPLICATE UPLOAD DETECTION
// ════════════════════════════════════════════════════════════════════════════════
//
// Verifies that re-uploading a byte-for-byte identical file to the same endpoint
// is blocked before finalization, and that a different file proceeds normally.

test.describe('13 · Duplicate Upload Detection', () => {
    test('uploading the same file twice is blocked — error shown + second S3 object deleted', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        const csvContent = 'id,name\n1,Alice\n2,Bob\n';

        // First upload — must succeed.
        const keyRef1 = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'data.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('successfully');
        expect(keyRef1.value).not.toBeNull();

        // Second upload — identical file content, must be blocked.
        const keyRef2 = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'data.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('identical to the current version');
        await assertS3KeyGone(keyRef2.value);

        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });

    test('uploading a different file after a previous upload proceeds normally', async ({ page }) => {
        const name = uid();
        await createEndpointViaUi(page, name);

        // First upload.
        const keyRef1 = await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'v1.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('id,name\n1,Alice\n'),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('successfully');
        expect(keyRef1.value).not.toBeNull();

        // Second upload — different content, must succeed.
        await captureS3Key(page);
        await page.locator('input[type="file"]').setInputFiles({
            name: 'v2.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('id,name\n1,Alice\n2,Bob\n'),
        });
        await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('[role="alert"]')).toContainText('successfully');

        await deleteEndpoint(name);
        await deleteS3Prefix(name);
    });
});

