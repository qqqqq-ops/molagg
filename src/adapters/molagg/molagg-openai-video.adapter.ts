import { BaseVideoAdapter, VideoGenerateParams } from '../base/base-video.adapter';
import { TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';
import {
  asRecord,
  asString,
  extractErrorMessage,
  extractStatusValue,
  extractTaskId,
  mapGenericVideoStatus,
  pickString,
} from '../base/video-task-parse';

/**
 * Molagg「seedance 按秒」分组的视频模型 —— 走 **OpenAI-video 协议**，和按次的 `seedance-2-5-special`（见 molagg-video.adapter）是两套。
 * 覆盖：seedance-2.5-pro / -720p / -g（5–30 秒）、seedance-2.0-eco / -mini（5–15 秒）。
 *
 * 契约（molagg.com openai-video 文档 + 本会话 2026-09-27 实测确认）：
 * - POST /v1/videos，**只认** `model` / `prompt` / `seconds` / `size` / `images`；
 *   多塞 `mode` / `count` / `duration` / `resolution` 会 400（实测 "unsupported video request field"）——所以这里白名单拼、不透传。
 * - `seconds` 传字符串；`size` 传 "宽x高"（比例在这里映射成 size，避免用未确认的 aspect_ratio 字段踩雷）；
 * - 参考图 / 首帧走 `images`（公网 http(s) 直链数组，拒 localhost / base64；中转站要自己去下载）。
 * - 查询 GET /v1/videos/{id}：status pending/processing/completed/failed，成片在 output_url。
 * 提交是付费动作，不做自动重试。
 * 注意：能否真出片还取决于 Molagg 后台给该分组的模型配了价，否则提交阶段就 `model_price_error: pricing unavailable`（不扣费）。
 */

const MODEL_MAX_SECONDS: Record<string, number> = {
  'seedance-2.5-pro': 30,
  'seedance-2.5-720p': 30,
  'seedance-2.5-g': 30,
  'seedance-2.0-eco': 15,
  'seedance-2.0-mini': 15,
};
const DEFAULT_MAX_SECONDS = 30;
const MIN_SECONDS = 5;
const MAX_IMAGES = 30;

// 比例 → size。只发 size（实测确认可用），不发未验证的 aspect_ratio 字段。
const SIZE_720: Record<string, string> = {
  '16:9': '1280x720',
  '9:16': '720x1280',
  '1:1': '720x720',
  '4:3': '960x720',
  '3:4': '720x960',
};
const SIZE_1080: Record<string, string> = {
  '16:9': '1920x1080',
  '9:16': '1080x1920',
  '1:1': '1080x1080',
  '4:3': '1440x1080',
  '3:4': '1080x1440',
};

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
  const single = asString(value);
  return single ? [single] : [];
}

/** 参考图 / 首帧都塞进 images（openai-video 这套没有单独的 mode 区分，靠提示词表达） */
function referenceImagesOf(p: Record<string, unknown>): string[] {
  const list = [
    ...asStringList(p.firstFrame),
    ...asStringList(p.referenceImage),
    ...asStringList(p.referenceImages),
    ...asStringList(p.images),
  ];
  return [...new Set(list)];
}

function isPublicHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && !/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url);
}

function modelKeyOf(p: Record<string, unknown>): string {
  return (asString(p.model) ?? asString(p.modelKey) ?? '').toLowerCase();
}

function maxSecondsFor(model: string): number {
  return MODEL_MAX_SECONDS[model] ?? DEFAULT_MAX_SECONDS;
}

/** 秒数夹到 [MIN, 模型上限]，默认 5 */
export function resolveSeconds(p: Record<string, unknown>): number {
  const model = modelKeyOf(p);
  const raw = Number(asString(p.seconds) ?? asString(p.duration) ?? (p.durationSeconds as number | undefined) ?? MIN_SECONDS);
  const n = Number.isFinite(raw) ? Math.round(raw) : MIN_SECONDS;
  return Math.min(maxSecondsFor(model), Math.max(MIN_SECONDS, n));
}

/** size：优先显式 "宽x高"；否则按比例 + 是否 1080p 映射；兜底 1280x720 */
export function resolveSize(p: Record<string, unknown>): string {
  const explicit = asString(p.size);
  if (explicit && /^\d+x\d+$/i.test(explicit)) return explicit.toLowerCase();
  const ratio = asString(p.aspect_ratio) ?? asString(p.aspectRatio) ?? asString(p.ratio) ?? '16:9';
  const wants1080 = asString(p.resolution)?.toLowerCase() === '1080p';
  const table = wants1080 ? SIZE_1080 : SIZE_720;
  return table[ratio] ?? table['16:9'];
}

export class MolaggOpenaiVideoAdapter extends BaseVideoAdapter {
  async submitTask(params: VideoGenerateParams): Promise<string> {
    const res = await this.httpClient.post('v1/videos', this.transformParams(params));
    const taskId = extractTaskId(res.data);
    if (!taskId) throw new Error(extractErrorMessage(res.data) ?? 'Molagg openai-video submit: missing task_id');
    return taskId;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const res = await this.httpClient.get(`v1/videos/${encodeURIComponent(taskId)}`);
    const status = mapGenericVideoStatus(extractStatusValue(res.data));
    const root = asRecord(res.data);
    const videoUrl = pickString(root, ['output_url', 'video_url', 'url']);
    const error = asRecord(root.error);
    const errorCode = asString(error.code);
    const errorMessage = asString(error.message) ?? extractErrorMessage(res.data);
    return {
      status,
      resultUrls: videoUrl ? [videoUrl] : [],
      errorMessage:
        status === 'failed' ? [errorCode, errorMessage].filter(Boolean).join(': ') || 'Task failed' : undefined,
      providerData: res.data,
    };
  }

  async getTaskResult(taskId: string): Promise<string> {
    return (await this.queryTaskStatus(taskId)).resultUrls?.[0] ?? '';
  }

  /** 文档没有取消接口；已提交的任务只能等它结束 */
  async cancelTask(): Promise<void> {
    return;
  }

  validateParams(params: unknown): ValidationResult {
    const p = (params ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const model = modelKeyOf(p);
    if (!model) errors.push('model is required');
    const prompt = asString(p.prompt);
    if (!prompt) errors.push('prompt is required');
    else if ([...prompt].length > 5000) errors.push('prompt must be at most 5000 characters');
    const images = referenceImagesOf(p);
    if (images.length > MAX_IMAGES) errors.push(`at most ${MAX_IMAGES} reference images`);
    // 中转站要自己去下载参考图：只能是公网 http(s) 直链，不能是 base64 / 本机地址
    if (images.some((url) => !isPublicHttpUrl(url))) {
      errors.push('reference images must be public http(s) URLs (not base64 or localhost)');
    }
    return { valid: errors.length === 0, errors };
  }

  transformParams(params: VideoGenerateParams): unknown {
    const p = (params ?? {}) as Record<string, unknown>;
    // 白名单：只发这几个确认可用的字段，多一个都会被 400
    const body: Record<string, unknown> = {
      model: asString(p.model) ?? asString(p.modelKey),
      prompt: asString(p.prompt),
      seconds: String(resolveSeconds(p)),
      size: resolveSize(p),
    };
    const images = referenceImagesOf(p);
    if (images.length > 0) body.images = images;
    return body;
  }
}
