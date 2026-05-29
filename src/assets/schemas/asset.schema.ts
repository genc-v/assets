import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ _id: true, timestamps: true })
export class Asset {
  _id: Types.ObjectId;

  @Prop({ required: true, index: true })
  entryId: string;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  originalname: string;

  @Prop()
  mimetype?: string;

  @Prop()
  size?: number;

  @Prop({ type: Object, default: {} })
  tags: Record<string, string>;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
