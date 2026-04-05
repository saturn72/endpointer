export type FeedFormat = 'csv' | 'xml' | 'json';

export interface FeedVersion {
  version: string; // semver
}

export type FeedRow = Record<string, string>;

export interface FeedSnapshot {
  endpointId: string;
  version: string;
  ingestedAt: Date;
  content: FeedRow[];
  sourceFormat: FeedFormat;
}