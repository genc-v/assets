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

  async listAssets(
    orgId: string,
    entryId?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const gen = await this.getListGeneration(orgId, entryId);
    const cacheKey = entryId
      ? `assets:list:${orgId}:${entryId}:${page}:${limit}:g${gen}`
      : `assets:list:${orgId}:${page}:${limit}:g${gen}`;

    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    } catch (err) {
      console.error('Cache GET failed:', (err as Error | undefined)?.message);
    }

    const org = await this.orgModel.findOne({ orgId }).lean().exec();
    if (!org) return { data: [], total: 0, page, limit, totalPages: 0 };

    const filtered = entryId
      ? org.assets.filter((a) => a.entryId === entryId)
      : org.assets;

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const data = filtered.slice(offset, offset + limit).map((a) => this.serialize(a));

    const result = { data, total, page, limit, totalPages };
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
    try {
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    } catch (err) {
      console.error('Cache GET failed:', (err as Error | undefined)?.message);
    }

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

  private async getListGeneration(orgId: string, entryId?: string): Promise<number> {
    const key = entryId
      ? `assets:list:gen:${orgId}:${entryId}`
      : `assets:list:gen:${orgId}`;
    try {
      const gen = await this.cache.get<number>(key);
      return gen ?? 0;
    } catch {
      return 0;
    }
  }

  private async invalidateListCache(orgId: string, entryId: string) {
    const bumpGen = async (key: string) => {
      try {
        const current = await this.cache.get<number>(key) ?? 0;
        await this.cache.set(key, current + 1, CACHE_TTL * 24);
      } catch (err) {
        console.error('Cache gen bump failed:', (err as Error | undefined)?.message);
      }
    };
    await Promise.all([
      bumpGen(`assets:list:gen:${orgId}`),
      bumpGen(`assets:list:gen:${orgId}:${entryId}`),
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
