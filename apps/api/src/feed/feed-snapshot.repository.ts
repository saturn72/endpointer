import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FeedSnapshot, FeedSnapshotDocument } from './feed-snapshot.schema';

@Injectable()
export class FeedSnapshotRepository {
  constructor(@InjectModel(FeedSnapshot.name) private model: Model<FeedSnapshotDocument>) {}

  async create(snapshot: Partial<FeedSnapshot>): Promise<FeedSnapshot> {
    const doc = new this.model(snapshot);
    return doc.save();
  }

  async findByEndpointId(endpointId: string): Promise<FeedSnapshot | null> {
    return this.model.findOne({ endpointId }).sort({ ingestedAt: -1 }).exec();
  }

  async findLatestByEndpointIdAndVersion(
    endpointId: string,
    version: string,
  ): Promise<FeedSnapshot | null> {
    return this.model.findOne({ endpointId, version }).exec();
  }
}