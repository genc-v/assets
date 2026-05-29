import { ApiProperty } from '@nestjs/swagger';

export class UpdateMetadataDto {
  @ApiProperty({
    description: 'Key-value tags to assign to the asset',
    example: { title: 'Hero Image', altText: 'A banner for the homepage' },
  })
  tags: Record<string, string>;
}
