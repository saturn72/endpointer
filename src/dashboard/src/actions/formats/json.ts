/**
 * JSON format handler.
 *
 * Structural assumption (explicit, revisitable):
 *   A valid JSON feed is a top-level array where each element is an object
 *   representing one record.  The "header" equivalent is the set of own keys
 *   of the FIRST element only — consistent with how CSV validates only the
 *   first row, XLSX validates only the first worksheet's first row, and XML
 *   validates only the first record's children.  Full-file consistency
 *   checking (e.g. verifying every object has the same keys) is out of scope.
 *
 *   Expected shape:
 *     [
 *       { "id": 1, "name": "Alice" },
 *       { "id": 2, "name": "Bob" }
 *     ]
 *   Derived header: ["id", "name"]
 *
 * Streaming: yes — uses `stream-json` with its `StreamArray` pipeline.
 *   Only the first array element is consumed; the underlying stream is
 *   destroyed immediately after resolving the first item, so large files
 *   are not buffered into memory.
 *
 * Duplicate keys note: in well-formed JSON, duplicate keys in a single object
 *   are technically permitted by the spec but have implementation-defined
 *   behaviour; the shared duplicate-check in finalizeUpload is still applied
 *   for consistency, though in practice V8's JSON.parse (and stream-json)
 *   will silently keep only the last value for a duplicated key.
 *
 * Encoding check: yes — JSON is text-based; UTF-8 validation is applied by
 *   finalizeUpload via utf8CheckedStream before bytes reach this handler.
 */

import { Readable } from 'node:stream';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/stream-array';
import type { FileFormatHandler, HeaderParseResult } from './index';

export const jsonHandler: FileFormatHandler = {
    extensions: ['.json'],
    supportsStreaming: true,
    supportsEncodingCheck: true,

    async getHeaderRow(body: AsyncIterable<Uint8Array>): Promise<HeaderParseResult> {
        const nodeStream = Readable.from(body);

        // Build a stream-json pipeline: JSON parser → array item streamer.
        // streamArray emits { key: index, value: item } for each array element.
        const pipeline = chain([nodeStream, parser(), streamArray()]);

        return new Promise<HeaderParseResult>((resolve) => {
            let settled = false;

            const settle = (result: HeaderParseResult) => {
                if (settled) return;
                settled = true;
                // Destroy the source to stop further I/O after we have what we need.
                nodeStream.destroy();
                resolve(result);
            };

            pipeline.on('data', (item: { key: number; value: unknown }) => {
                // We only care about the first element (key === 0).
                if (item.key !== 0) return;

                const first = item.value;

                if (
                    first === null ||
                    typeof first !== 'object' ||
                    Array.isArray(first)
                ) {
                    settle({ error: 'File could not be parsed as valid JSON: first array element is not an object' });
                    return;
                }

                const keys = Object.keys(first as Record<string, unknown>);
                if (keys.length === 0) {
                    settle({ error: 'File must have a non-empty header row' });
                    return;
                }

                settle({ headers: keys.map((k) => k.trim()) });
            });

            pipeline.on('error', (err: Error) => {
                // Swallow benign "stream destroyed" errors that fire after we settle.
                if (settled) return;
                settle({ error: 'File could not be parsed as valid JSON' });
            });

            pipeline.on('end', () => {
                if (!settled) {
                    // Reached end of stream without any array items.
                    settle({ error: 'File must have a non-empty header row' });
                }
            });

            // Handle the case where the top-level value is not a JSON array at all.
            // stream-json's streamArray emits an error if the root is not an array.
        });
    },
};
