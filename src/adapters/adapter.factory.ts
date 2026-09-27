import { ApiChannel } from '@prisma/client';

import { DoubaoImageAdapter } from './doubao/doubao-image.adapter';
import { DoubaoVideoAdapter } from './doubao/doubao-video.adapter';
import { GptImageAdapter } from './gptimage/gptimage-image.adapter';
import { HailuoVideoAdapter } from './hailuo/hailuo-video.adapter';
import { KlingVideoAdapter } from './kling/kling-video.adapter';
import { MidjourneyImageAdapter } from './midjourney/midjourney-image.adapter';
import { NanobananaImageAdapter } from './nanobanana/nanobanana-image.adapter';
import { QianwenImageAdapter } from './qianwen/qianwen-image.adapter';
import { MolaggVideoAdapter } from './molagg/molagg-video.adapter';
import { MolaggOpenaiVideoAdapter } from './molagg/molagg-openai-video.adapter';
import { SoraVideoAdapter } from './sora/sora-video.adapter';
import { VeoVideoAdapter } from './veo/veo-video.adapter';
import { ViduVideoAdapter } from './vidu/vidu-video.adapter';
import { WanxVideoAdapter } from './wanx/wanx-video.adapter';
import { BaseImageAdapter } from './base/base-image.adapter';
import { BaseVideoAdapter } from './base/base-video.adapter';
import { normalizeProviderKey } from '../common/utils/provider.util';

type ImageAdapterConstructor = new (channel: ApiChannel) => BaseImageAdapter;
type VideoAdapterConstructor = new (channel: ApiChannel) => BaseVideoAdapter;

export class AdapterFactory {
  private static imageAdapters: Map<string, ImageAdapterConstructor> = new Map<string, ImageAdapterConstructor>([
    ['midjourney', MidjourneyImageAdapter],
    ['mj', MidjourneyImageAdapter], // Alias for midjourney
    ['doubao', DoubaoImageAdapter],
    ['nanobanana', NanobananaImageAdapter],
    ['gptimage', GptImageAdapter],
    ['qianwen', QianwenImageAdapter],
    ['qwen', QianwenImageAdapter],
  ]);

  private static videoAdapters: Map<string, VideoAdapterConstructor> = new Map<string, VideoAdapterConstructor>([
    ['doubao', DoubaoVideoAdapter],
    ['doubao_video', DoubaoVideoAdapter],
    ['wanx', WanxVideoAdapter],
    ['wanxiang', WanxVideoAdapter],
    ['kling', KlingVideoAdapter],
    ['sora', SoraVideoAdapter],
    ['openai', SoraVideoAdapter],
    ['veo', VeoVideoAdapter],
    ['google', VeoVideoAdapter],
    ['hailuo', HailuoVideoAdapter],
    ['minimax', HailuoVideoAdapter],
    ['vidu', ViduVideoAdapter],
    ['molagg', MolaggVideoAdapter],
    // Molagg「按秒」分组的 seedance-2.5-pro/-720p/-g、2.0-eco/-mini：走 OpenAI-video 协议
    ['molagg-persecond', MolaggOpenaiVideoAdapter],
  ]);

  static createImageAdapter(provider: string, channel: ApiChannel): BaseImageAdapter {
    const AdapterClass = this.imageAdapters.get(normalizeProviderKey(provider)) ?? this.imageAdapters.get(provider);
    if (!AdapterClass) throw new Error(`Image adapter for provider ${provider} not found`);
    return new AdapterClass(channel);
  }

  static createVideoAdapter(provider: string, channel: ApiChannel): BaseVideoAdapter {
    const AdapterClass = this.videoAdapters.get(normalizeProviderKey(provider)) ?? this.videoAdapters.get(provider);
    if (!AdapterClass) throw new Error(`Video adapter for provider ${provider} not found`);
    return new AdapterClass(channel);
  }

  static registerImageAdapter(provider: string, adapterClass: ImageAdapterConstructor) {
    this.imageAdapters.set(provider, adapterClass);
  }

  static registerVideoAdapter(provider: string, adapterClass: VideoAdapterConstructor) {
    this.videoAdapters.set(provider, adapterClass);
  }

  static getSupportedProviders() {
    return {
      image: Array.from(this.imageAdapters.keys()),
      video: Array.from(this.videoAdapters.keys()),
    };
  }
}
