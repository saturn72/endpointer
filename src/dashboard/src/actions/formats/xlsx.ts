/**
 * XLSX format handler.
 *
 * Streaming: partially — the XLSX format is a zip-based container; exceljs
 *   must consume the full stream before row events become available, so there
 *   is no true stop-after-first-row short-circuit.  The streaming API avoids
 *   materialising a full parsed object tree in memory, but the raw bytes are
 *   fully consumed.  This is the best guarantee achievable without a custom
 *   zip reader.
 *
 * Encoding check: no — XLSX is a binary format with its own internal string
 *   encoding handled by exceljs.  UTF-8 validation does not apply.
 *
 * First worksheet only — additional sheets are silently ignored, consistent
 *   with the documented design assumption from Step 0.3.
 */

import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import type { FileFormatHandler, HeaderParseResult } from './index';

export const xlsxHandler: FileFormatHandler = {
    extensions: ['.xlsx'],
    supportsStreaming: false, // partial streaming only — see module docstring
    supportsEncodingCheck: false,

    async getHeaderRow(body: AsyncIterable<Uint8Array>): Promise<HeaderParseResult> {
        const nodeStream = Readable.from(body);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const workbookReader = new (ExcelJS as any).stream.xlsx.WorkbookReader(nodeStream, {
            entries: 'emit',
            sharedStrings: 'cache',
            styles: 'ignore',
            hyperlinks: 'ignore',
            worksheets: 'emit',
        });

        return new Promise<HeaderParseResult>((resolve) => {
            let settled = false;
            let firstWorksheetProcessed = false;
            let headers: string[] = [];

            const settle = (result: HeaderParseResult) => {
                if (!settled) {
                    settled = true;
                    resolve(result);
                }
            };

            workbookReader.on('worksheet', (worksheet: ExcelJS.Worksheet) => {
                if (firstWorksheetProcessed) return;
                firstWorksheetProcessed = true;

                let firstRowCaptured = false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (worksheet as any).on('row', (row: ExcelJS.Row) => {
                    if (firstRowCaptured) return;
                    firstRowCaptured = true;
                    // ExcelJS row.values is 1-based; index 0 is always undefined.
                    const rawValues = row.values as (ExcelJS.CellValue | null | undefined)[];
                    headers = Array.from({ length: rawValues.length - 1 }, (_, i) => {
                        const v = rawValues[i + 1];
                        return v == null ? '' : String(v).trim();
                    });
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (worksheet as any).on('error', () => {
                    settle({ error: 'File could not be parsed as a valid XLSX spreadsheet' });
                });
            });

            workbookReader.on('end', () => settle({ headers }));
            workbookReader.on('error', () => {
                settle({ error: 'File could not be parsed as a valid XLSX spreadsheet' });
            });

            workbookReader.read();
        });
    },
};
