import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VersionPointerDocument = VersionPointer & Document;

@Schema({ collection: 'version_pointers' })
export class VersionPointer {
  @Prop({ required: true, unique: true })
  endpointId!: string;

  @Prop({ required: true })
  latestVersion!: string;

  @Prop({ default: Date.now })
  updatedAt?: Date;
}

export const VersionPointerSchema = SchemaFactory.createForClass(VersionPointer);