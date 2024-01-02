export type MediaType = 'json' | 'csv' | 'xml';

export function mediaTypeToContentType(mediaType: MediaType): string {
    switch (mediaType) {
        case 'csv':
            return 'text/csv'
        case 'json':
            return 'application/json'
        case 'xml':
            return 'text/xml'
        default:
            throw new Error(`Not supported medi type: ${mediaType}`);
    }
}
export class PathInfo {
    owner: string;
    name: string;
    version: string | undefined;
    mediaType: MediaType;

    private _path: string;

    get path(): string | undefined {
        return this._path ??= `${this.owner}/${this.name}/${this.version}/data.${this.mediaType}`
    }
}