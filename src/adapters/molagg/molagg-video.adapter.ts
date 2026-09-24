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
 * Molagg 中转站的按次视频（seedance-2-5-special）。
 * 接口契约照 Molagg 文档（molagg.com/static/molagg-docs/…/index.html 第 3、4 节）：
 * - 提交 POST /v1/videos，JSON 顶层字段，**只认** model / prompt / mode / duration / count / resolution / aspect_ratio / images，
 *   多一个字段就 400——所以这里白名单拼请求，不透传；
 * - 固定 30 秒、每次 1 条、按次计费（不按秒乘价）；
 * - 查询 GET /v1/videos/{task_id}：status = pending / processing / completed / failed，成片在 output_url；
 * - 下载 GET /v1/videos/{task_id}/content 需要鉴权，本站拿 output_url 转存。
 * 提交是付费动作：这里不做任何自动重试。
 */
const FIXED_SECONDS = 30;
const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'];
const RESOLUTIONS = ['720p', '1080p'];
const MAX_IMAGES = 30;
const MODES = ['text-to-video', 'first-frame', 'reference'];

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter((item): item is string => Boolean(item));
  const single = asString(value);
  return single ? [single] : [];
}

function referenceImagesOf(p: Record<string, unknown>) {
  const list = [
    ...asStringList(p.firstFrame),
    ...asStringList(p.referenceImage),
    ...asStringList(p.referenceImages),
    ...asStringList(p.images),
  ];
  return [...new Set(list)];
}

/**
 * 上游的 mode：不写时「带图 = 首帧生」，所以参考创作必须显式写 reference。
 * 显式传了 mode 就用它；否则只有首帧字段 → first-frame，有参考图字段 → reference，没图 → 文生。
 */
function resolveMode(p: Record<string, unknown>): string | undefined {
  const explicit = asString(p.mode)?.toLowerCase();
  if (explicit) return explicit;
  if (asStringList(p.referenceImage).length || asStringList(p.referenceImages).length) return 'reference';
  if (asStringList(p.firstFrame).length) return 'first-frame';
  return undefined;
}

export class MolaggVideoAdapter extends BaseVideoAdapter {
  async submitTask(params: VideoGenerateParams): Promise<string> {
    const res = await this.httpClient.post('v1/videos', this.transformParams(params));
    const taskId = extractTaskId(res.data);
    if (!taskId) throw new Error(extractErrorMessage(res.data) ?? 'Molagg video submit: missing task_id');
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

  /** 文档没有取消接口；已经提交的任务只能等它结束（失败会自动退款） */
  async cancelTask(): Promise<void> {
    return;
  }

  validateParams(params: unknown): ValidationResult {
    const p = (params ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    if (!asString(p.model) && !asString(p.modelKey)) errors.push('model is required');
    const prompt = asString(p.prompt);
    if (!prompt) errors.push('prompt is required');
    else if ([...prompt].length > 5000) errors.push('prompt must be at most 5000 characters');
    const ratio = asString(p.aspect_ratio) ?? asString(p.aspectRatio) ?? asString(p.ratio);
    if (ratio && !ASPECT_RATIOS.includes(ratio)) errors.push(`aspect ratio must be one of ${ASPECT_RATIOS.join(', ')}`);
    const resolution = asString(p.resolution)?.toLowerCase();
    if (resolution && !RESOLUTIONS.includes(resolution)) errors.push('resolution must be 720p or 1080p');
    const images = referenceImagesOf(p);
    if (images.length > MAX_IMAGES) errors.push(`at most ${MAX_IMAGES} reference images`);
    // 中转站要自己去下载参考图：只能是公网 http(s) 直链，不能是 base64 / 本机地址
    if (images.some((url) => !/^https?:\/\//i.test(url) || /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url))) {
      errors.push('reference images must be public http(s) URLs (not base64 or localhost)');
    }
    const mode = resolveMode(p);
    if (mode && !MODES.includes(mode)) errors.push(`mode must be one of ${MODES.join(', ')}`);
    else if (mode && mode !== 'text-to-video' && images.length === 0) errors.push('this mode requires images');
    else if (mode === 'text-to-video' && images.length > 0) errors.push('text-to-video cannot take images');
    return { valid: errors.length === 0, errors };
  }

  transformParams(params: VideoGenerateParams): unknown {
    const p = (params ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {
      model: asString(p.model) ?? asString(p.modelKey),
      prompt: asString(p.prompt),
      // 这条线只接受 30 秒、1 条；界面上选的时长对它无效，价格也按次固定
      duration: FIXED_SECONDS,
      count: 1,
    };
    const ratio = asString(p.aspect_ratio) ?? asString(p.aspectRatio) ?? asString(p.ratio);
    if (ratio) body.aspect_ratio = ratio;
    const resolution = asString(p.resolution)?.toLowerCase();
    if (resolution && RESOLUTIONS.includes(resolution)) body.resolution = resolution;
    const images = referenceImagesOf(p);
    if (images.length > 0) body.images = images;
    const mode = resolveMode(p);
    if (mode) body.mode = mode;
    return body;
  }
}
