import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FeedSnapshotDocument = FeedSnapshot & Document;

@Schema({ collection: 'feed_snapshots' })
export class FeedSnapshot {
  @Prop({ required: true })
  endpointId!: string;

  @Prop({ required: true })
  version!: string;

  @Prop({ required: true })
  ingestedAt!: Date;

  @Prop({ required: true })
  sourceFormat!: string;

  @Prop({ required: true })
  rowCount!: number;

  @Prop({ required: true })
  s3Key!: string;

  @Prop({ type: [Object], required: true })
  content!: Array<Record<string, string>>;

  @Prop({ default: Date.now })
  createdAt?: Date;
}

export const FeedSnapshotSchema = SchemaFactory.createForClass(FeedSnapshot);