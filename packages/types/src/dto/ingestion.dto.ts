import { FeedFormat } from '../domain/feed-version';

// Ingestion DTOs
export interface UploadFeedDto {
  file: any; // File object from web API
  datafeedId: string;
  endpointId: string;
}

export interface IngestionResultDto {
  version: string;
  rowCount: number;
  ingestedAt: string;
}

// Feed delivery DTOs
export interface FeedRequestDto {
  publisherName: string;
  endpointName: string;
  format: FeedFormat;
}

export interface FeedResponseDto {
  version: string;
  content: string;
  format: string;
  servedAt: string;
}

// Subscription DTOs
export interface CreateSubscriptionRequestDto {
  endpointId: string;
}

export interface ApproveSubscriptionDto {
  subscriptionId: string;
}

export interface RejectSubscriptionDto {
  subscriptionId: string;
}

// Usage DTOs
export interface UsageRecordDto {
  subscriberId: string;
  endpointId: string;
  version: string;
  format: FeedFormat;
  requestedAt: Date;
  responseStatus: number;
}