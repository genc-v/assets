import { ApiProperty } from '@nestjs/swagger';

export class FileUploadResponseDto {
  @ApiProperty({ example: 'entry-123' })
  entryId: string;

  @ApiProperty({ example: 'user-id/entry-id/timestamp-filename.ext' })
  assetId: string;

  @ApiProperty({ example: 'user-id/entry-id/timestamp-filename.ext' })
  key: string;

  @ApiProperty({ example: 'http://localhost:9000/uploads/...' })
  url: string;
}
