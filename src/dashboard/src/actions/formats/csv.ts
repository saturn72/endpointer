/**
 * CSV format handler.
 *
 * Streaming: yes — reads only until the first newline (or 64 KB) then stops.
 * Encoding check: yes — UTF-8 validation is applied by finalizeUpload via
 *   utf8CheckedStream before this handler receives the bytes.
 */

import { parse as csvParseSync } from 'csv-parse/sync';
import type { FileFormatHandler, HeaderParseResult } from './index';

export const csvHandler: FileFormatHandler = {
    extensions: ['.csv'],
    supportsStreaming: true,
    supportsEncodingCheck: true,

    async getHeaderRow(body: AsyncIterable<Uint8Array>): Promise<HeaderParseResult> {
        let headerBuffer = Buffer.alloc(0);

        for await (const rawChunk of body) {
            const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
            headerBuffer = Buffer.concat([headerBuffer, chunk]);

            // Short-circuit: stop as soon as we have a complete first line.
            if (
                headerBuffer.includes(0x0a /* \n */) ||
                headerBuffer.includes(0x0d /* \r */) ||
                headerBuffer.length >= 64 * 1024
            ) {
                break;
            }
        }

        if (headerBuffer.length === 0) return { error: 'File is empty' };

        try {
            const rows = csvParseSync(headerBuffer, {
                columns: false,
                relax_quotes: true,
                to: 1, // parse only the first row; stop immediately after
                skip_empty_lines: false,
            }) as string[][];
            return { headers: (rows[0] ?? []).map((h) => h.trim()) };
        } catch {
            return { error: 'File could not be parsed as valid CSV' };
        }
    },
};
