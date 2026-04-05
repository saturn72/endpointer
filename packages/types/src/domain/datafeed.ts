export interface Datafeed {
  id: string;
  publisherId: string;
  name: string;
  description: string;
  currentVersion: string; // semver
  lastIngestedAt: Date;
  rowCount: number;
  createdAt: Date;
}