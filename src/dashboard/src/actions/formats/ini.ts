/**
 * INI format handler.
 *
 * Structural assumption (explicit, revisitable — see README):
 *   A valid INI feed has one or more [section] headers, each followed by
 *   key=value lines.  Each section is treated as one "record".  The "header"
 *   equivalent is the set of keys within the FIRST section only — consistent
 *   with how other formats inspect only the first record (CSV: first row,
 *   XLSX: first worksheet's first row, XML: first record's children, JSON:
 *   first array element).
 *
 *   If the file has NO section headers at all (flat key=value from the top
 *   of the file), the entire file is treated as a single implicit record and
 *   its keys become the header.
 *
 *   Example (sectioned):
 *     [record1]
 *     id=1
 *     name=Alice
 *
 *     [record2]
 *     id=2
 *     name=Bob
 *   Derived header: ["id", "name"]
 *
 *   Example (flat / section-less):
 *     id=1
 *     name=Alice
 *   Derived header: ["id", "name"]
 *
 * Streaming: yes — the handler reads line-by-line and stops as soon as it
 *   encounters the start of the SECOND section (or EOF for flat files),
 *   so only the bytes needed to derive the header are consumed.  No
 *   external INI-parsing library is used: INI's line-oriented grammar
 *   (comment lines start with ; or #, section lines are [name], key lines
 *   are key=value with optional surrounding whitespace) is simple enough
 *   that a hand-rolled line reader is clearer and avoids an extra dependency.
 *
 * Encoding check: yes — INI is text-based; UTF-8 validation is applied by
 *   finalizeUpload via utf8CheckedStream before bytes reach this handler.
 *
 * Design note: INI is the least settled of all six supported formats.  The
 *   tabular-feed model (records × fixed column names) maps naturally to CSV,
 *   XLSX/XLS, JSON arrays, and XML record lists, but maps loosely to INI's
 *   intended key-value/config semantics.  The format is included per the
 *   original requirements but should be validated against real INI feed
 *   samples before treating this implementation as production-ready.
 */

import type { FileFormatHandler, HeaderParseResult } from './index';

export const iniHandler: FileFormatHandler = {
    extensions: ['.ini'],
    supportsStreaming: true,
    supportsEncodingCheck: true,

    async getHeaderRow(body: AsyncIterable<Uint8Array>): Promise<HeaderParseResult> {
        const keys: string[] = [];
        let inFirstSection = false;    // true once we have seen ≥1 key=value in current scope
        let sawSection = false;        // true once we encounter the first [section] line
        let firstSectionDone = false;  // true once the second [section] starts (stop point)
        let leftoverBytes = '';

        for await (const rawChunk of body) {
            if (firstSectionDone) break;

            // Decode incrementally; carry any incomplete line across chunk boundaries.
            const text = leftoverBytes + Buffer.from(rawChunk).toString('utf-8');
            const lines = text.split(/\r?\n/);
            // The last slice may be an incomplete line — keep it for the next iteration.
            leftoverBytes = lines.pop() ?? '';

            for (const rawLine of lines) {
                if (firstSectionDone) break;
                const line = rawLine.trim();

                // Skip blank lines and comments (; or # starters).
                if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;

                // [section] header
                if (line.startsWith('[') && line.endsWith(']')) {
                    if (sawSection) {
                        // Second section starts — first section's keys are complete.
                        firstSectionDone = true;
                        break;
                    }
                    sawSection = true;
                    continue;
                }

                // key=value line.
                const eqIdx = line.indexOf('=');
                if (eqIdx === -1) {
                    // Malformed line: not a comment, not a section header, not a key=value.
                    return { error: 'File could not be parsed as valid INI: unexpected line format' };
                }
                keys.push(line.slice(0, eqIdx).trim());
            }
        }

        // Handle any leftover (last line without trailing newline).
        if (!firstSectionDone && leftoverBytes.trim() !== '') {
            const line = leftoverBytes.trim();
            if (!line.startsWith(';') && !line.startsWith('#') && !line.startsWith('[')) {
                const eqIdx = line.indexOf('=');
                if (eqIdx === -1) {
                    return { error: 'File could not be parsed as valid INI: unexpected line format' };
                }
                keys.push(line.slice(0, eqIdx).trim());
            }
        }

        if (keys.length === 0) {
            return { error: 'File must have a non-empty header row' };
        }

        return { headers: keys };
    },
};
