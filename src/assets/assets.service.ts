import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Model } from 'mongoose';
import type { Cache } from 'cache-manager';
import { StorageService } from '../storage/storage.service';
import { KafkaService } from '../kafka/kafka.service';
import {
  Organisation,
  OrganisationDocument,
} from '../organisations/schemas/organisation.schema';
import { OrganisationsService } from '../organisations/organisations.service';

const CACHE_TTL = 5 * 60 * 1000;

@Injectable()
export class AssetsService {
  constructor(
    private readonly storage: StorageService,
    private readonly kafka: KafkaService,
    private readonly orgs: OrganisationsService,
    @InjectModel(Organisation.name)
    private readonly orgModel: Model<OrganisationDocument>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async upload(orgId: string, entryId: string, file: Express.Multer.File) {
    const { key } = await this.storage.uploadOrgFile(
      orgId,
      entryId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    const url = this.buildUrl(key);

    const asset = {
      entryId,
      key,
      url,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      tags: {},
    };

    await this.orgModel.findOneAndUpdate(
      { orgId },
      { $push: { assets: asset } },
      { upsert: true },
    );

    await this.invalidateListCache(orgId, entryId);

    await this.kafka.publishFileUploaded({
      entryId,
      assetId: key,
      key,
      originalname: file.originalname,
      uploadedAt: new Date().toISOString(),
      url,
    });

    return { entryId, assetId: key, key, url };
  }

  async listAssets(orgId: string, entryId?: string) {
    const cacheKey = entryId
      ? `assets:list:${orgId}:${entryId}`
      : `assets:list:${orgId}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const org = await this.orgModel.findOne({ orgId }).lean().exec();
    if (!org) return [];

    const assets = entryId
      ? org.assets.filter((a) => a.entryId === entryId)
      : org.assets;

    const result = assets.map((a) => this.serialize(a));
    try {
      await this.cache.set(cacheKey, result, CACHE_TTL);
      console.log('Cache SET ok:', cacheKey);
    } catch (err) {
      console.error('Cache SET failed:', (err as Error | undefined)?.message);
    }
    return result;
  }

  async getAssetInfo(key: string) {
    const cacheKey = `assets:info:${key}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const org = await this.orgModel
      .findOne({ 'assets.key': key })
      .lean()
      .exec();
    if (!org) throw new NotFoundException('Asset not found');

    const asset = org.assets.find((a) => a.key === key);
    if (!asset) throw new NotFoundException('Asset not found');

    const result = this.serialize(asset);
    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  async updateMetadata(key: string, tags: Record<string, string>) {
    const org = await this.orgModel
      .findOneAndUpdate(
        { 'assets.key': key },
        { $set: { 'assets.$.tags': tags } },
        { new: true },
      )
      .exec();
    if (!org) throw new NotFoundException('Asset not found');

    const asset = org.assets.find((a) => a.key === key)!;
    await Promise.all([
      this.cache.del(`assets:info:${key}`),
      this.invalidateListCache(org.orgId, asset.entryId),
    ]);

    return { key, tags };
  }

  async deleteAsset(key: string) {
    const org = await this.orgModel.findOne({ 'assets.key': key }).exec();
    if (!org) throw new NotFoundException('Asset not found');

    const asset = org.assets.find((a) => a.key === key)!;

    await this.orgModel.updateOne(
      { 'assets.key': key },
      { $pull: { assets: { key } } },
    );

    await this.storage
      .deleteAsset(key)
      .catch((err) =>
        console.error(
          `MinIO delete failed for key ${key}:`,
          (err as Error | undefined)?.message,
        ),
      );

    await Promise.all([
      this.cache.del(`assets:info:${key}`),
      this.invalidateListCache(org.orgId, asset.entryId),
    ]);

    return { deleted: key };
  }

  private async invalidateListCache(orgId: string, entryId: string) {
    await Promise.all([
      this.cache.del(`assets:list:${orgId}`),
      this.cache.del(`assets:list:${orgId}:${entryId}`),
    ]);
  }

  private serialize(doc: Record<string, unknown>) {
    const { _id, __v: _v, ...rest } = doc;
    return { id: String(_id), ...rest };
  }

  private buildUrl(key: string): string {
    const endpoint = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
    const bucket = process.env.MINIO_BUCKET || 'uploads';
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${endpoint}/${bucket}/${encodedKey}`;
  }
}
