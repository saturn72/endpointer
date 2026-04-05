export * from './domain/feed';
export * from './events/datafeed';
export type FeedFormat = 'csv' | 'xml' | 'json';
export interface FeedRequestDto {
    publisherName: string;
    endpointName: string;
    format: FeedFormat;
}
