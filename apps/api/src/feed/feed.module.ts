import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeedSnapshot, FeedSnapshotSchema } from './feed-snapshot.schema';
import { VersionPointer, VersionPointerSchema } from './version-pointer.schema';
import { FeedSnapshotRepository } from './feed-snapshot.repository';
import { VersionPointerRepository } from './version-pointer.repository';
import { FeedIngestionSubscriber } from './feed-ingestion.subscriber';
import { NatsModule } from '../nats/nats.module';

@Module({
  imports: [
    NatsModule,
    MongooseModule.forFeature([
      { name: FeedSnapshot.name, schema: FeedSnapshotSchema },
      { name: VersionPointer.name, schema: VersionPointerSchema },
    ]),
  ],
  providers: [FeedSnapshotRepository, VersionPointerRepository, FeedIngestionSubscriber],
  exports: [FeedSnapshotRepository, VersionPointerRepository],
})
export class FeedModule {}