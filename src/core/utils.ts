export function hasLiteralValue(source: string | null | undefined): boolean {
    return !!source && !!source.trim();
}