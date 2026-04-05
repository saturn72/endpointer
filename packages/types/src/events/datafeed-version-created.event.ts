import { FeedFormat } from '../domain/feed-version';

export const DATAFEED_VERSION_CREATED_SUBJECT = 'datafeed.version.created';

export interface DatafeedVersionCreatedPayload {
  publisherId: string;
  datafeedId: string;
  endpointId: string;
  version: string; // semver e.g. "1.0.22"
  ingestedAt: string; // ISO timestamp
  sourceFormat: FeedFormat;
  rowCount: number;
  s3Key: string; // path to original file in MinIO
}

export interface DatafeedVersionCreatedEvent {
  subject: typeof DATAFEED_VERSION_CREATED_SUBJECT;
  payload: DatafeedVersionCreatedPayload;
}