import {
  Controller,
  Get,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { FileService } from './file.service';
import express from 'express';
import { ApiTags, ApiResponse } from '@nestjs/swagger';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly fileService: FileService) {}

  @Get('*')
  @ApiResponse({
    status: 200,
    description: 'Public file stream from MinIO',
    content: {
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  async getPublicFile(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.url.replace('/uploads/', '');
    try {
      const stream = await this.fileService.getFile(path);

      const ext = path.toLowerCase().split('.').pop();
      const contentTypeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        pdf: 'application/pdf',
        mp4: 'video/mp4',
        webm: 'video/webm',
      };

      res.setHeader(
        'Content-Type',
        contentTypeMap[ext || ''] || 'application/octet-stream',
      );

      stream.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
          res.status(404).end('File not found');
        }
      });

      stream.pipe(res);
    } catch (err) {
      console.error('File fetch error:', err);
      throw new NotFoundException('File not found');
    }
  }
}
