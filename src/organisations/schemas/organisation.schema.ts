import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Asset, AssetSchema } from '../../assets/schemas/asset.schema';

export type OrganisationDocument = HydratedDocument<Organisation>;

@Schema({ timestamps: true })
export class Organisation {
  @Prop({ required: true, unique: true, index: true })
  orgId: string;

  @Prop({ type: [AssetSchema], default: [] })
  assets: Asset[];
}

export const OrganisationSchema = SchemaFactory.createForClass(Organisation);
