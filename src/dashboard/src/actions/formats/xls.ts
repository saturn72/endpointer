/**
 * XLS (legacy OLE2 binary) format handler.
 *
 * Streaming: no — DOCUMENTED EXCEPTION.  The OLE2 container format used by
 *   .xls files is not streamable by mainstream JS parsers; exceljs does not
 *   support XLS at all.  The entire file must be buffered before parsing.
 *   This is bounded by MAX_UPLOAD_BYTES (10 MB) so worst-case memory usage is
 *   predictable and acceptable.
 *
 * Encoding check: no — XLS is a binary format; UTF-8 validation does not apply.
 *
 * First worksheet only — additional sheets are silently ignored.
 */

import * as XLSX from 'xlsx';
import type { FileFormatHandler, HeaderParseResult } from './index';

export const xlsHandler: FileFormatHandler = {
    extensions: ['.xls'],
    supportsStreaming: false, // non-streamable OLE2 format — see module docstring
    supportsEncodingCheck: false,

    async getHeaderRow(body: AsyncIterable<Uint8Array>): Promise<HeaderParseResult> {
        // Buffer the full file (bounded by the presigned-POST content-length-range policy).
        const chunks: Buffer[] = [];
        for await (const rawChunk of body) {
            chunks.push(Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk));
        }
        const buffer = Buffer.concat(chunks);

        let workbook: XLSX.WorkBook;
        try {
            workbook = XLSX.read(buffer, { type: 'buffer' });
        } catch {
            return { error: 'File could not be parsed as a valid XLS spreadsheet' };
        }

        if (!workbook.SheetNames.length) {
            return { headers: [] }; // No worksheets — treated as empty header by shared validation
        }

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        let rows: (string | null)[][];
        try {
            rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, {
                header: 1,
                raw: false, // convert all cell values to strings
                defval: '', // empty string for empty cells
            });
        } catch {
            return { error: 'File could not be parsed as a valid XLS spreadsheet' };
        }

        if (!rows.length) return { headers: [] };

        const firstRow = rows[0];
        return { headers: firstRow.map((v) => (v == null ? '' : String(v).trim())) };
    },
};
