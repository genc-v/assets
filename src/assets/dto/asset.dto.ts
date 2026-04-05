import { ApiProperty } from '@nestjs/swagger';

export class AssetListItemDto {
  @ApiProperty({ example: 'user-id/entry-id/timestamp-filename.ext' })
  assetId: string;

  @ApiProperty({ example: 'entry-123' })
  entryId: string;

  @ApiProperty({ example: 'image.png' })
  filename: string;

  @ApiProperty({ example: 'user-id/entry-id/timestamp-filename.ext' })
  key: string;

  @ApiProperty({ example: 1024, required: false })
  size?: number;

  @ApiProperty({ example: '2023-10-27T10:00:00.000Z', required: false })
  lastModified?: string;
}

export class AssetsResponseDto {
  @ApiProperty({ type: [AssetListItemDto] })
  items: AssetListItemDto[];

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}
