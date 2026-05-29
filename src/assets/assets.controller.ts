import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
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
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssetAccessGuard } from './guards/asset-access.guard';
import { AssetAccess } from './decorators/asset-access.decorator';
import { AssetsService } from './assets.service';
import { UpdateMetadataDto } from './dto/update-metadata.dto';

@ApiTags('assets')
@ApiBearerAuth()
@Controller('organisations/:orgId/assets')
@UseGuards(JwtAuthGuard, AssetAccessGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post()
  @AssetAccess('write')
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
    if (!entryId?.trim()) throw new BadRequestException('entryId is required');
    if (!file?.buffer) throw new BadRequestException('No file uploaded');
    return this.assets.upload(orgId, entryId.trim(), file);
  }

  @Get()
  @AssetAccess('read')
  @ApiQuery({
    name: 'entryId',
    required: false,
    description: 'Filter by entry ID',
  })
  @ApiResponse({ status: 200 })
  async list(
    @Param('orgId') orgId: string,
    @Query('entryId') entryId?: string,
  ) {
    return this.assets.listAssets(orgId, entryId);
  }

  @Get('info')
  @AssetAccess('read')
  @ApiQuery({
    name: 'key',
    required: true,
    description: 'Full asset key (e.g. orgs/orgId/entryId/file.jpg)',
  })
  @ApiResponse({ status: 200 })
  async getInfo(@Query('key') key: string) {
    if (!key) throw new BadRequestException('key query param is required');
    return this.assets.getAssetInfo(key);
  }

  @Patch('metadata')
  @AssetAccess('write')
  @ApiQuery({ name: 'key', required: true, description: 'Full asset key' })
  @ApiResponse({ status: 200 })
  async updateMetadata(
    @Query('key') key: string,
    @Body() dto: UpdateMetadataDto,
  ) {
    if (!key) throw new BadRequestException('key query param is required');
    if (!dto?.tags || typeof dto.tags !== 'object') {
      throw new BadRequestException('tags must be a key-value object');
    }
    return this.assets.updateMetadata(key, dto.tags);
  }

  @Delete()
  @AssetAccess('delete')
  @ApiQuery({ name: 'key', required: true, description: 'Full asset key' })
  @ApiResponse({ status: 200 })
  async remove(@Query('key') key: string) {
    if (!key) throw new BadRequestException('key query param is required');
    return this.assets.deleteAsset(key);
  }
}
