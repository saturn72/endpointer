export type MediaType = 'json' | 'csv' | 'xml';
export class PathInfo {
    owner: string;
    name: string;
    version: string | undefined;
    path: string | undefined;
    mediaType: MediaType;
}