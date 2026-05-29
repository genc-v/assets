import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Organisation,
  OrganisationSchema,
} from './schemas/organisation.schema';
import { OrganisationsService } from './organisations.service';
import { OrganisationsController } from './organisations.controller';
import { StorageModule } from '../storage/storage.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organisation.name, schema: OrganisationSchema },
    ]),
    StorageModule,
    KafkaModule,
  ],
  controllers: [OrganisationsController],
  providers: [OrganisationsService],
  exports: [OrganisationsService, MongooseModule],
})
export class OrganisationsModule {}
