import { Controller, Get, Req, Res, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiResponse } from '@nestjs/swagger';
import express from 'express';
import { StorageService } from '../storage/storage.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Get('*')
  @ApiResponse({ status: 200, description: 'Public file stream from MinIO' })
  async getPublicFile(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    const key = req.url.replace('/uploads/', '');
    try {
      const stream = await this.storage.getFileStream(key);

      const ext = key.toLowerCase().split('.').pop() ?? '';
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
        contentTypeMap[ext] || 'application/octet-stream',
      );

      stream.on('error', () => {
        if (!res.headersSent) res.status(404).end('File not found');
      });

      stream.pipe(res);
    } catch {
      throw new NotFoundException('File not found');
    }
  }
}
