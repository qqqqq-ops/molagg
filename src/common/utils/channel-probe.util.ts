/**
 * 渠道连通性探测。
 *
 * 不能只对 baseUrl 发 HEAD —— 那样 404 也会算成功，用户以为配好了，
 * 真正生成时才失败。这里直接打该 provider 会用到的原生路径，按状态码判断：
 *   401/403 → 路径存在，只是没带密钥/无权限，对连通性探测来说就是「通」
 *   404     → 这个地址根本不提供该 provider 需要的接口
 *
 * 各 provider 的路径来自 src/adapters/ 下各适配器的实际请求。
 */

import axios from 'axios';

export const CHANNEL_PROBE_PATHS: Record<string, string> = {
  nanobanana: '/v1beta/models',
  gptimage: '/v1/images/generations',
  mj: '/mj/submit/imagine',
  kling: '/kling/v1/videos/text2video',
  sora: '/v1/videos',
  veo: '/v1/videos/generations',
  hailuo: '/v1/query/video_generation',
  vidu: '/ent/v2/tasks',
  doubao: '/api/v3/contents/generations/tasks',
  qwen: '/api/v1/services/aigc/multimodal-generation/generation',
  wanx: '/api/v1/services/aigc/multimodal-generation/generation',
};

export type ChannelProbeResult = {
  ok: boolean;
  baseUrl: string;
  provider: string;
  url?: string;
  status?: number;
  reason: 'no_base_url' | 'reachable' | 'not_supported' | 'upstream_error' | 'unreachable';
  message: string;
  ms: number;
};

export async function probeChannel(params: {
  baseUrl: string;
  provider: string;
  timeout: number;
}): Promise<ChannelProbeResult> {
  const { provider } = params;
  const baseUrl = params.baseUrl.trim();

  if (!baseUrl) {
    return { ok: false, baseUrl: '', provider, reason: 'no_base_url', message: '还没有填写 Base URL', ms: 0 };
  }

  const url = `${baseUrl.replace(/\/+$/, '')}${CHANNEL_PROBE_PATHS[provider] ?? ''}`;
  const startedAt = Date.now();

  try {
    const res = await axios.request({
      method: 'POST',
      url,
      data: {},
      headers: { 'Content-Type': 'application/json' },
      timeout: Math.min(params.timeout, 10_000),
      validateStatus: () => true,
    });
    const ms = Date.now() - startedAt;

    if (res.status === 404) {
      return {
        ok: false, baseUrl, provider, url, status: 404, reason: 'not_supported', ms,
        message: '这个地址不提供该渠道需要的接口（404）。如果用的是中转站，它可能不透传该厂商的原生格式',
      };
    }
    if (res.status >= 500) {
      return { ok: false, baseUrl, provider, url, status: res.status, reason: 'upstream_error', message: `上游返回 ${res.status}`, ms };
    }
    // 401/403 说明接口存在，只是这次探测没带密钥
    return { ok: true, baseUrl, provider, url, status: res.status, reason: 'reachable', message: '接口可达', ms };
  } catch (error: any) {
    const code = error?.code ?? '';
    const message =
      code === 'ENOTFOUND' || code === 'EAI_AGAIN'
        ? '域名解析不了，请检查 Base URL 是否写对'
        : code === 'ECONNABORTED'
          ? '请求超时'
          : (error?.message ?? '请求失败');
    return { ok: false, baseUrl, provider, url, reason: 'unreachable', message, ms: Date.now() - startedAt };
  }
}
