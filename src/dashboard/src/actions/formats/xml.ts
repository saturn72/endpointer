/**
 * XML format handler.
 *
 * Structural assumption (explicit, revisitable):
 *   A valid XML feed has a single root element containing one or more sibling
 *   child elements, each representing one record.  The "header" equivalent is
 *   the set of DIRECT child element tag names found under the FIRST record
 *   element.  Attributes on any element are IGNORED for header derivation.
 *
 *   Expected shape:
 *     <feed>
 *       <record><id>1</id><name>Alice</name></record>
 *       <record><id>2</id><name>Bob</name></record>
 *     </feed>
 *   Derived header: ["id", "name"]
 *
 *   Namespace assumption (explicit, revisitable):
 *   Namespace prefixes in element names (e.g. <ns:record>) are stripped before
 *   comparison; only the local name part is used.  Documents that rely on
 *   namespace semantics for correctness need revisiting before real data.
 *
 * Streaming: yes — the sax streaming parser reads only until the first record's
 *   closing tag, then destroys the readable to stop further I/O.
 *
 * Encoding check: yes — XML is text-based; UTF-8 validation is applied by
 *   finalizeUpload via utf8CheckedStream before bytes reach this handler.
 */

import sax from 'sax';
import { Readable } from 'node:stream';
import type { FileFormatHandler, HeaderParseResult } from './index';

/** Strip namespace prefix from an element name, e.g. "ns:record" → "record". */
function localName(name: string): string {
    const colon = name.indexOf(':');
    return colon === -1 ? name : name.slice(colon + 1);
}

export const xmlHandler: FileFormatHandler = {
    extensions: ['.xml'],
    supportsStreaming: true,
    supportsEncodingCheck: true,

    async getHeaderRow(body: AsyncIterable<Uint8Array>): Promise<HeaderParseResult> {
        const nodeStream = Readable.from(body);

        // strict = true: case-sensitive, requires well-formed XML.
        const parser = sax.createStream(true, { normalize: false, position: false });

        return new Promise<HeaderParseResult>((resolve) => {
            let settled = false;
            let depth = 0;
            let firstRecordClosed = false;
            const childTags: string[] = [];

            const settle = (result: HeaderParseResult) => {
                if (settled) return;
                settled = true;
                // Destroy the readable to stop streaming after first record.
                nodeStream.destroy();
                resolve(result);
            };

            parser.on('opentag', (node) => {
                depth++;
                // depth 1 = root element
                // depth 2 = record elements (first is the one we inspect)
                // depth 3 = direct children of first record = header fields
                if (depth === 3 && !firstRecordClosed) {
                    childTags.push(localName(node.name));
                }
            });

            // sax closetag fires BEFORE we decrement; depth still reflects the
            // element being closed.
            parser.on('closetag', () => {
                if (depth === 2 && !firstRecordClosed) {
                    // Closing the first record element — all its children collected.
                    firstRecordClosed = true;
                    settle({ headers: childTags.map((t) => t.trim()) });
                }
                depth--;
            });

            parser.on('error', () => {
                settle({ error: 'File could not be parsed as valid XML' });
                // sax requires resume() after an error to continue; since we've settled,
                // just resume to let the stream drain without hanging.
                parser.resume();
            });

            parser.on('end', () => {
                // End of document reached before we found the first record.
                if (!settled) settle({ headers: [] }); // empty → caught by shared validation
            });

            nodeStream.on('error', () => {
                // Stream destroyed intentionally after settle() — ignore the error.
            });

            nodeStream.pipe(parser);
        });
    },
};
