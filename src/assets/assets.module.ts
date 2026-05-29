import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaModule } from '../kafka/kafka.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { Asset, AssetSchema } from './schemas/asset.schema';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetAccessGuard } from './guards/asset-access.guard';

@Module({
  imports: [
    KafkaModule,
    OrganisationsModule,
    MongooseModule.forFeature([{ name: Asset.name, schema: AssetSchema }]),
  ],
  controllers: [AssetsController],
  providers: [AssetsService, AssetAccessGuard],
})
export class AssetsModule {}
