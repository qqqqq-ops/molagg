import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { CanvasModule } from './canvas/canvas.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CredentialsModule } from './credentials/credentials.module';
import { EncryptionModule } from './encryption/encryption.module';
import { ImagesModule } from './images/images.module';
import { LocalRunnerModule } from './local-runner/local-runner.module';
import { ModelsModule } from './models/models.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { PromptOptimizeModule } from './prompt-optimize/prompt-optimize.module';
import { ProvidersModule } from './providers/providers.module';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { TasksModule } from './tasks/tasks.module';
import { VideosModule } from './videos/videos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CredentialsModule,
    EncryptionModule,
    StorageModule,
    SettingsModule,
    LocalRunnerModule,
    ModelsModule,
    ProvidersModule,
    ImagesModule,
    VideosModule,
    PromptOptimizeModule,
    ChatModule,
    ProjectsModule,
    CanvasModule,
    TasksModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
