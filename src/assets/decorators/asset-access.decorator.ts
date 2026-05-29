import { SetMetadata } from '@nestjs/common';
import {
  ASSET_ACCESS_KEY,
  AssetAccessLevel,
} from '../guards/asset-access.guard';

export const AssetAccess = (level: AssetAccessLevel) =>
  SetMetadata(ASSET_ACCESS_KEY, level);
