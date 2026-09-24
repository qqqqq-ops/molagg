import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CanvasService } from './canvas.service';
import { CreateCanvasSnapshotDto, CreateCanvasTemplateDto, SaveCanvasBoardDto } from './dto/canvas.dto';

/**
 * 无限画布的存储：当前画布自动保存、版本快照、工作流模板。
 * 只存用户自己搭的图，不碰任何渠道 / 密钥。
 */
@UseGuards(JwtAuthGuard)
@Controller('canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Get('boards/current')
  currentBoard(@CurrentUser('id') userId: bigint) {
    return this.canvasService.getCurrentBoard(userId);
  }

  @Put('boards/:id')
  saveBoard(@CurrentUser('id') userId: bigint, @Param('id') id: string, @Body() dto: SaveCanvasBoardDto) {
    return this.canvasService.saveBoard(userId, BigInt(id), dto.graph, dto.name);
  }

  @Get('boards/:id/snapshots')
  listSnapshots(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.canvasService.listSnapshots(userId, BigInt(id));
  }

  @Post('boards/:id/snapshots')
  createSnapshot(@CurrentUser('id') userId: bigint, @Param('id') id: string, @Body() dto: CreateCanvasSnapshotDto) {
    return this.canvasService.createSnapshot(userId, BigInt(id), dto.graph, dto.label);
  }

  @Get('snapshots/:id')
  getSnapshot(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.canvasService.getSnapshot(userId, BigInt(id));
  }

  @Delete('snapshots/:id')
  deleteSnapshot(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.canvasService.deleteSnapshot(userId, BigInt(id));
  }

  @Get('templates')
  listTemplates(@CurrentUser('id') userId: bigint) {
    return this.canvasService.listTemplates(userId);
  }

  @Post('templates')
  createTemplate(@CurrentUser('id') userId: bigint, @Body() dto: CreateCanvasTemplateDto) {
    return this.canvasService.createTemplate(userId, dto.name, dto.graph, dto.description);
  }

  @Get('templates/:id')
  getTemplate(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.canvasService.getTemplate(userId, BigInt(id));
  }

  @Delete('templates/:id')
  deleteTemplate(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.canvasService.deleteTemplate(userId, BigInt(id));
  }
}
