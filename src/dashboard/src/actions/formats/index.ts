/**
 * Format handler abstraction for the FeedHub upload pipeline.
 *
 * FileFormatHandler is the shared interface that every upload format implements.
 * The registry maps file extensions (without leading dot, lowercase) to their
 * handler instance.  Adding a new format requires only:
 *   1. Implement FileFormatHandler in a new module under formats/
 *   2. Add registerHandler(newHandler) to formats/registry.ts
 *
 * finalizeUpload never needs to be edited for new formats.
 */

// ── Shared types ──────────────────────────────────────────────────────────────

export type HeaderParseResult = { headers: string[] } | { error: string };

export interface FileFormatHandler {
    /** File extensions handled by this parser, e.g. ['.csv']. */
    extensions: string[];
    /**
     * True when the format can be parsed in a streaming fashion without
     * buffering the full file.  False is a documented exception (see XLS).
     */
    supportsStreaming: boolean;
    /**
     * True when the format is text-based and should have its byte stream
     * validated for UTF-8 encoding before being handed to the parser.
     * Binary formats (XLSX, XLS) set this to false.
     */
    supportsEncodingCheck: boolean;
    /**
     * Extract the header row from the upload stream.
     * Returns { headers } on success or { error } on a user-actionable
     * validation failure.  Infra-level I/O errors should be thrown so
     * finalizeUpload can convert them to infra-error responses.
     */
    getHeaderRow(body: AsyncIterable<Uint8Array>): Promise<HeaderParseResult>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = new Map<string, FileFormatHandler>();

/** Register a handler for all extensions it declares. */
export function registerHandler(handler: FileFormatHandler): void {
    for (const ext of handler.extensions) {
        registry.set(normalizeExt(ext), handler);
    }
}

/** Look up a handler by extension (with or without leading dot, any case). */
export function getHandler(ext: string): FileFormatHandler | undefined {
    return registry.get(normalizeExt(ext));
}

/** All unique extension strings (without leading dot) currently registered. */
export function registeredExtensions(): string[] {
    return [...new Set(registry.keys())];
}

function normalizeExt(ext: string): string {
    return ext.replace(/^\./, '').toLowerCase();
}

// ── Shared utilities ──────────────────────────────────────────────────────────

/**
 * A custom error thrown by utf8CheckedStream when the byte stream contains
 * sequences that are not valid UTF-8.  finalizeUpload catches this class
 * and surfaces it as a user-facing validation error (not an infra error).
 */
export class Utf8ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'Utf8ValidationError';
    }
}

/**
 * Async generator that passes each chunk through unchanged but validates
 * that the bytes form valid UTF-8.  Throws Utf8ValidationError immediately
 * on the first invalid byte sequence.
 *
 * Used by finalizeUpload for handlers with supportsEncodingCheck: true.
 */
export async function* utf8CheckedStream(
    body: AsyncIterable<Uint8Array>,
): AsyncGenerator<Uint8Array> {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for await (const chunk of body) {
        try {
            decoder.decode(chunk, { stream: true });
        } catch {
            throw new Utf8ValidationError(
                'File must be UTF-8 encoded. Please re-save it as UTF-8 and try again.',
            );
        }
        yield chunk;
    }
}
