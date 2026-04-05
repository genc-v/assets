import { Module } from '@nestjs/common';
import { StorageModule } from './storage/storage.module';
import { KafkaModule } from './kafka/kafka.module';
import { FileService } from './file/file.service';
import { FileController } from './file/file.controller';
import { UploadsController } from './file/uploads.controller';
import { AuthModule } from './auth/auth.module';
import { AssetsController } from './assets/assets.controller';
import { AssetsService } from './assets/assets.service';

@Module({
  imports: [AuthModule, StorageModule, KafkaModule],
  controllers: [FileController, UploadsController, AssetsController],
  providers: [FileService, AssetsService],
})
export class AppModule {}
