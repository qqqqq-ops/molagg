import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiChannel } from '@prisma/client';
import axios from 'axios';

import { DEFAULT_API_CHANNELS, upsertDefaultApiChannels } from '../admin/channels/default-api-channels';
import { ApiChannelStatus } from '../common/prisma-enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { SHARED_CHAT_CHANNEL_NAME, SHARED_CHAT_PROVIDER } from '../settings/ai-chat.constants';
import { AiSettings, DEFAULT_AI_SETTINGS } from '../settings/system-settings.constants';
import { probeChannel } from '../common/utils/channel-probe.util';

export type UserChannelView = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string | null;
  apiSecret: string | null;
  extraHeaders: Record<string, string> | null;
  timeout: number;
  maxRetry: number;
  rateLimit: number | null;
  status: string;
  priority: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UserCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async resolveChannel(userId: bigint, channelId: bigint): Promise<ApiChannel> {
    const channel = await this.prisma.apiChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    return this.mergeChannel(userId, channel);
  }

  async mergeChannel(userId: bigint, channel: ApiChannel): Promise<ApiChannel> {
    const cred = await this.prisma.userChannelCredential.findUnique({
      where: { user_channel_credential_user_channel_unique: { userId, channelId: channel.id } },
    });

    const baseUrl = (cred?.baseUrl ?? channel.baseUrl ?? '').trim();
    const apiKey = cred?.apiKey ?? null;
    const apiSecret = cred?.apiSecret ?? null;
    const extraHeaders = cred?.extraHeaders ?? channel.extraHeaders;
    const status = baseUrl && apiKey ? ApiChannelStatus.active : ApiChannelStatus.disabled;

    return {
      ...channel,
      baseUrl,
      apiKey,
      apiSecret,
      extraHeaders,
      status,
    };
  }

  async listMediaChannels(userId: bigint): Promise<UserChannelView[]> {
    await upsertDefaultApiChannels(this.prisma);
    const channels = await this.prisma.apiChannel.findMany({
      where: { id: { in: DEFAULT_API_CHANNELS.map((channel) => BigInt(channel.id)) } },
    });
    const orderMap = new Map(DEFAULT_API_CHANNELS.map((channel, index) => [BigInt(channel.id).toString(), index]));
    const sorted = [...channels].sort((a, b) => {
      const aIndex = orderMap.get(a.id.toString()) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.get(b.id.toString()) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });

    const merged = await Promise.all(sorted.map((channel) => this.mergeChannel(userId, channel)));
    return merged.map((channel) => this.serializeChannel(channel));
  }

  async updateMediaChannel(userId: bigint, channelId: bigint, dto: { baseUrl?: string; apiKey?: string }) {
    if (!DEFAULT_API_CHANNELS.some((channel) => BigInt(channel.id) === channelId)) {
      throw new NotFoundException('Channel not found');
    }
    await upsertDefaultApiChannels(this.prisma);
    const channel = await this.prisma.apiChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');

    const existing = await this.prisma.userChannelCredential.findUnique({
      where: { user_channel_credential_user_channel_unique: { userId, channelId } },
    });

    const nextBaseUrl = dto.baseUrl === undefined ? existing?.baseUrl ?? channel.baseUrl : dto.baseUrl.trim();
    if (!nextBaseUrl) {
      throw new BadRequestException('Base URL 不能为空');
    }

    let nextApiKey = existing?.apiKey ?? null;
    if (dto.apiKey !== undefined) {
      const trimmed = dto.apiKey.trim();
      if (!trimmed) throw new BadRequestException('API Key 不能为空');
      nextApiKey = this.encryption.encryptString(trimmed);
    }
    if (!nextApiKey) {
      throw new BadRequestException('请填写 API Key');
    }

    const saved = await this.prisma.userChannelCredential.upsert({
      where: { user_channel_credential_user_channel_unique: { userId, channelId } },
      create: {
        userId,
        channelId,
        baseUrl: nextBaseUrl,
        apiKey: nextApiKey,
      },
      update: {
        baseUrl: nextBaseUrl,
        apiKey: nextApiKey,
      },
    });

    return this.serializeChannel({
      ...channel,
      baseUrl: saved.baseUrl || channel.baseUrl,
      apiKey: saved.apiKey,
      apiSecret: saved.apiSecret,
      status: ApiChannelStatus.active,
    });
  }

  async testMediaChannel(userId: bigint, channelId: bigint) {
    const channel = await this.resolveChannel(userId, channelId);
    return probeChannel({
      baseUrl: channel.baseUrl,
      provider: channel.provider,
      timeout: channel.timeout,
    });
  }

  async getAiSettings(userId: bigint): Promise<AiSettings> {
    const row = await this.prisma.userAiSetting.findUnique({ where: { userId } });
    return {
      apiBaseUrl: row?.apiBaseUrl || DEFAULT_AI_SETTINGS.apiBaseUrl,
      apiKey: row?.apiKey ? (this.encryption.decryptString(row.apiKey) ?? '') : '',
      modelName: row?.modelName || DEFAULT_AI_SETTINGS.modelName,
      systemPrompt: DEFAULT_AI_SETTINGS.systemPrompt,
    };
  }

  async getAiSettingsMasked(userId: bigint) {
    const settings = await this.getAiSettings(userId);
    if (settings.apiKey && settings.apiKey.length > 8) {
      settings.apiKey = `${settings.apiKey.slice(0, 4)}****${settings.apiKey.slice(-4)}`;
    } else if (settings.apiKey) {
      settings.apiKey = '****';
    }
    const { systemPrompt: _systemPrompt, ...rest } = settings;
    return rest;
  }

  async setAiSettings(userId: bigint, input: Partial<AiSettings>) {
    const current = await this.prisma.userAiSetting.findUnique({ where: { userId } });
    const nextBaseUrl = input.apiBaseUrl === undefined ? current?.apiBaseUrl ?? '' : input.apiBaseUrl.trim();
    const nextModelName = input.modelName === undefined ? current?.modelName ?? '' : input.modelName.trim();
    let nextApiKey = current?.apiKey ?? null;
    if (typeof input.apiKey === 'string' && input.apiKey && !input.apiKey.includes('****')) {
      nextApiKey = this.encryption.encryptString(input.apiKey.trim());
    }

    await this.prisma.userAiSetting.upsert({
      where: { userId },
      create: {
        userId,
        apiBaseUrl: nextBaseUrl,
        apiKey: nextApiKey,
        modelName: nextModelName,
      },
      update: {
        apiBaseUrl: nextBaseUrl,
        apiKey: nextApiKey,
        modelName: nextModelName,
      },
    });

    await this.syncUserChatChannel(userId, nextBaseUrl, nextApiKey);
    return this.getAiSettingsMasked(userId);
  }

  private async syncUserChatChannel(userId: bigint, baseUrl: string, encryptedApiKey: string | null) {
    if (!baseUrl.trim() || !encryptedApiKey) return;

    let channel = await this.prisma.apiChannel.findFirst({
      where: { provider: SHARED_CHAT_PROVIDER, name: SHARED_CHAT_CHANNEL_NAME },
      orderBy: { id: 'asc' },
    });

    if (!channel) {
      channel = await this.prisma.apiChannel.create({
        data: {
          name: SHARED_CHAT_CHANNEL_NAME,
          provider: SHARED_CHAT_PROVIDER,
          baseUrl,
          apiKey: null,
          timeout: 240_000, // 文本中转站慢的时候只回一个字都要 90 秒，2 分钟不够
          maxRetry: 2,
          status: ApiChannelStatus.active,
          priority: 0,
          description: 'Shared chat channel template',
        },
      });
    }

    await this.prisma.userChannelCredential.upsert({
      where: { user_channel_credential_user_channel_unique: { userId, channelId: channel.id } },
      create: {
        userId,
        channelId: channel.id,
        baseUrl,
        apiKey: encryptedApiKey,
      },
      update: {
        baseUrl,
        apiKey: encryptedApiKey,
      },
    });
  }

  private serializeChannel(channel: ApiChannel): UserChannelView {
    return {
      id: channel.id.toString(),
      name: channel.name,
      provider: channel.provider,
      baseUrl: channel.baseUrl,
      apiKey: channel.apiKey ? 'configured' : null,
      apiSecret: channel.apiSecret ? 'configured' : null,
      extraHeaders: null,
      timeout: channel.timeout,
      maxRetry: channel.maxRetry,
      rateLimit: channel.rateLimit,
      status: channel.status,
      priority: channel.priority,
      description: channel.description,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }
}
