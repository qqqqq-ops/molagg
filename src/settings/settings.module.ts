import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SystemSettingsService } from './system-settings.service';
import { AiSettingsService } from './ai-settings.service';
import { StorageSettingsService } from './storage-settings.service';
import { UserSettingsController } from './user-settings.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UserSettingsController],
  providers: [SystemSettingsService, AiSettingsService, StorageSettingsService],
  exports: [SystemSettingsService, AiSettingsService, StorageSettingsService],
})
export class SettingsModule {}
