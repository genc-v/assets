import {
  Controller,
  Post,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgAccessGuard } from './org-access.guard';
import { StorageService } from '../storage/storage.service';
import { KafkaService } from '../kafka/kafka.service';

@ApiTags('organisations')
@ApiBearerAuth()
@Controller('organisations')
@UseGuards(JwtAuthGuard)
export class OrganisationsController {
  constructor(
    private readonly storage: StorageService,
    private readonly kafka: KafkaService,
  ) {}

  @Post(':orgId/upload')
  @UseGuards(OrgAccessGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['entryId', 'file'],
      properties: {
        entryId: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201 })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('orgId') orgId: string,
    @Body('entryId') entryId: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!entryId || entryId.trim().length === 0) {
      throw new BadRequestException('entryId is required');
    }
    if (!file?.buffer || !file?.originalname) {
      throw new BadRequestException('No file uploaded or invalid file');
    }

    const { key } = await this.storage.uploadOrgFile(
      orgId,
      entryId.trim(),
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const endpoint = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
    const bucket = process.env.MINIO_BUCKET || 'uploads';
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const url = `${endpoint}/${bucket}/${encodedKey}`;

    await this.kafka.publishFileUploaded({
      entryId: entryId.trim(),
      assetId: key,
      key,
      originalname: file.originalname,
      uploadedAt: new Date().toISOString(),
      url,
    });

    return { entryId: entryId.trim(), assetId: key, key, url };
  }
}
