// Domain types
export * from './domain/feed';

// Events
export * from './events/datafeed';

// DTOs
export type FeedFormat = 'csv' | 'xml' | 'json';

export interface FeedRequestDto {
    publisherName: string;
    endpointName: string;
    format: FeedFormat;
}
