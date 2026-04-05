import { FeedFormat } from '../domain/feed';
export declare const DATAFEED_VERSION_CREATED_SUBJECT = "datafeed.version.created";
export interface DatafeedVersionCreatedPayload {
    publisherId: string;
    datafeedId: string;
    endpointId: string;
    version: string;
    ingestedAt: string;
    sourceFormat: FeedFormat;
    rowCount: number;
    s3Key: string;
}
export interface DatafeedVersionCreatedEvent {
    subject: typeof DATAFEED_VERSION_CREATED_SUBJECT;
    payload: DatafeedVersionCreatedPayload;
}
