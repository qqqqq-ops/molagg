import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserCredentialsService } from '../credentials/user-credentials.service';
import { UpdateAiSettingsDto } from '../admin/ai-settings/dto/update-ai-settings.dto';
import { UpdateUserChannelDto } from './dto/update-user-channel.dto';

@UseGuards(JwtAuthGuard)
@Controller('settings')
export class UserSettingsController {
  constructor(private readonly credentials: UserCredentialsService) {}

  @Get('channels')
  listChannels(@CurrentUser('id') userId: bigint) {
    return this.credentials.listMediaChannels(userId);
  }

  @Put('channels/:id')
  updateChannel(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: UpdateUserChannelDto,
  ) {
    return this.credentials.updateMediaChannel(userId, BigInt(id), dto);
  }

  @Post('channels/:id/test')
  testChannel(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.credentials.testMediaChannel(userId, BigInt(id));
  }

  @Get('ai')
  getAiSettings(@CurrentUser('id') userId: bigint) {
    return this.credentials.getAiSettingsMasked(userId);
  }

  @Put('ai')
  updateAiSettings(@CurrentUser('id') userId: bigint, @Body() dto: UpdateAiSettingsDto) {
    return this.credentials.setAiSettings(userId, dto);
  }
}
