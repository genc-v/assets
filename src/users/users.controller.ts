import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { StorageService } from '../storage/storage.service';
import { KafkaService } from '../kafka/kafka.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly storage: StorageService,
    private readonly kafka: KafkaService,
  ) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201 })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new BadRequestException('User ID not found in token');

    if (!file?.buffer || !file?.originalname) {
      throw new BadRequestException('No file uploaded');
    }

    const { key } = await this.storage.uploadUserFile(
      userId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const endpoint = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
    const bucket = process.env.MINIO_BUCKET || 'uploads';
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const url = `${endpoint}/${bucket}/${encodedKey}`;

    await this.kafka.publishFileUploaded({
      entryId: '',
      assetId: key,
      key,
      originalname: file.originalname,
      uploadedAt: new Date().toISOString(),
      url,
    });

    return { assetId: key, key, url };
  }
}
