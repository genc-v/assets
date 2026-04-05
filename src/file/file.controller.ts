import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  Param,
  Res,
  NotFoundException,
  BadRequestException,
  UseGuards,
  Body,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileService } from './file.service';
import express, { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtPayload } from '../auth/jwt.strategy';
import { FileUploadResponseDto } from './dto/file-upload.dto';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        entryId: { type: 'string' },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'The file has been successfully uploaded.',
    type: FileUploadResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Body('entryId') entryId: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request & { user: JwtPayload },
  ) {
    if (
      !entryId ||
      typeof entryId !== 'string' ||
      entryId.trim().length === 0
    ) {
      throw new BadRequestException('entryId is required');
    }

    if (!file?.buffer || !file?.originalname || !file?.mimetype) {
      throw new BadRequestException('No file uploaded or invalid file');
    }

    const userId = req.user?.sub;
    if (!userId) {
      throw new BadRequestException('User ID not found');
    }

    return this.fileService.uploadFile(
      entryId.trim(),
      userId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Get(':key')
  @ApiResponse({
    status: 200,
    description: 'The file stream',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async getFile(@Param('key') key: string, @Res() res: express.Response) {
    try {
      const stream = await this.fileService.getFile(key);

      // Optional: set content type to application/octet-stream
      res.setHeader('Content-Type', 'application/octet-stream');

      // Handle streaming errors
      stream.on('error', (err) => {
        console.error('Stream error:', err);
        res.status(500).end('Error reading file');
      });

      stream.pipe(res);
    } catch (err) {
      console.error('File fetch error:', err);
      throw new NotFoundException('File not found');
    }
  }
}
