import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { StorageModule } from './storage/storage.module';
import { KafkaModule } from './kafka/kafka.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { OrganisationsModule } from './organisations/organisations.module';
import { AssetsModule } from './assets/assets.module';
import { UploadsController } from './file/uploads.controller';
import { UsersController } from './users/users.controller';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [
          new KeyvRedis(
            `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
          ),
        ],
        ttl: 5 * 60 * 1000,
      }),
    }),
    AuthModule,
    DatabaseModule,
    StorageModule,
    KafkaModule,
    OrganisationsModule,
    AssetsModule,
  ],
  controllers: [UploadsController, UsersController],
})
export class AppModule {}
