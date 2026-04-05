import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssetsService } from './assets.service';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtPayload } from '../auth/jwt.strategy';
import { AssetsResponseDto } from './dto/asset.dto';

@ApiTags('assets')
@ApiBearerAuth()
@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of assets for the current user',
    type: AssetsResponseDto,
  })
  async getAssets(
    @Query('page') pageRaw: string | undefined,
    @Query('pageSize') pageSizeRaw: string | undefined,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const page = pageRaw ? Number(pageRaw) : 1;
    const pageSize = pageSizeRaw ? Number(pageSizeRaw) : 20;

    if (!Number.isFinite(page) || page < 1) {
      throw new BadRequestException('page must be >= 1');
    }

    if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('pageSize must be between 1 and 100');
    }

    const userId = req.user?.sub;
    if (!userId) {
      // Should handle case where sub is missing, though Guard usually guarantees user presence.
      // But sub might be optional in JwtPayload definition?
      throw new BadRequestException('User ID not found in token');
    }

    return this.assetsService.getAssets(page, pageSize, userId);
  }
}
