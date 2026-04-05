import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VersionPointer, VersionPointerDocument } from './version-pointer.schema';

@Injectable()
export class VersionPointerRepository {
  constructor(@InjectModel(VersionPointer.name) private model: Model<VersionPointerDocument>) {}

  async upsert(endpointId: string, latestVersion: string): Promise<VersionPointer> {
    return this.model
      .findOneAndUpdate(
        { endpointId },
        { endpointId, latestVersion, updatedAt: new Date() },
        { upsert: true, new: true },
      )
      .exec();
  }

  async findLatestVersion(endpointId: string): Promise<string | null> {
    const doc = await this.model.findOne({ endpointId }).exec();
    return doc?.latestVersion || null;
  }
}