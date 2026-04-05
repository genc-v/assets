import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';

export type AssetListItem = {
  assetId: string;
  entryId: string;
  filename: string;
  key: string;
  size?: number;
  lastModified?: string;
};

@Injectable()
export class AssetsService {
  constructor(private readonly storage: StorageService) {}

  private parseKey(key: string) {
    const firstSlash = key.indexOf('/');
    if (firstSlash === -1) {
      return { entryId: '', remainder: key };
    }
    return {
      entryId: key.slice(0, firstSlash),
      remainder: key.slice(firstSlash + 1),
    };
  }

  async getAssets(page: number, pageSize: number, userId: string) {
    const all = await this.storage.listAssets(userId ? `${userId}/` : '');

    const sorted = all
      .slice()
      .sort(
        (a, b) =>
          (b.lastModified?.getTime?.() ?? 0) -
          (a.lastModified?.getTime?.() ?? 0),
      );

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;

    const items: AssetListItem[] = sorted.slice(start, end).map((obj) => {
      let keyToParse = obj.key;
      if (userId && keyToParse.startsWith(userId + '/')) {
        keyToParse = keyToParse.slice(userId.length + 1);
      }

      const { entryId, remainder } = this.parseKey(keyToParse);
      const dashIdx = remainder.indexOf('-');
      const filename =
        dashIdx === -1 ? remainder : remainder.slice(dashIdx + 1);

      return {
        assetId: obj.key,
        entryId,
        filename,
        key: obj.key,
        size: obj.size,
        lastModified: obj.lastModified
          ? obj.lastModified.toISOString()
          : undefined,
      };
    });

    return {
      page: safePage,
      pageSize,
      total,
      totalPages,
      items,
    };
  }
}
