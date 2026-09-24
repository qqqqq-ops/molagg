import { BaseVideoAdapter, VideoGenerateParams } from '../base/base-video.adapter';
import { TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';
import {
  asNumber,
  asString,
  extractErrorMessage,
  extractStatusValue,
  extractTaskId,
  extractVideoUrl,
  mapGenericVideoStatus,
} from '../base/video-task-parse';

function isKlingV3(model: string | undefined) {
  const raw = (model ?? '').toLowerCase();
  return raw.includes('kling-v3') || raw.includes('kling-3') || raw.includes('omni');
}

export class KlingVideoAdapter extends BaseVideoAdapter {
  async submitTask(params: VideoGenerateParams): Promise<string> {
    const body = this.transformParams(params) as Record<string, unknown>;
    const model = asString(body.model_name) ?? asString(body.model);
    const image = asString(body.image);
    const path = isKlingV3(model)
      ? 'kling/v1/videos/omni-video'
      : image
        ? 'v1/videos/image2video'
        : 'v1/videos/text2video';
    const res = await this.httpClient.post(path, body);
    const taskId = extractTaskId(res.data);
    if (!taskId) throw new Error(extractErrorMessage(res.data) ?? 'Kling submit: missing task id');
    return `${path}:${taskId}`;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const [path, id] = this.splitTaskId(taskId);
    const res = await this.httpClient.get(`${path}/${encodeURIComponent(id)}`);
    const status = mapGenericVideoStatus(extractStatusValue(res.data));
    const videoUrl = extractVideoUrl(res.data);
    return {
      status,
      resultUrls: videoUrl ? [videoUrl] : [],
      errorMessage: status === 'failed' ? extractErrorMessage(res.data) ?? 'Task failed' : undefined,
      providerData: res.data,
    };
  }

  async getTaskResult(taskId: string): Promise<string> {
    return (await this.queryTaskStatus(taskId)).resultUrls?.[0] ?? '';
  }

  async cancelTask(_taskId: string): Promise<void> {
    return;
  }

  validateParams(params: unknown): ValidationResult {
    const p = (params ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const prompt = asString(p.prompt);
    const model = asString(p.model) ?? asString(p.model_name) ?? asString(p.modelKey);
    if (!model) errors.push('model is required');
    if (!prompt) errors.push('prompt is required');
    const duration = asNumber(p.duration);
    if (duration !== undefined) {
      if (isKlingV3(model)) {
        if (!Number.isInteger(duration) || duration < 3 || duration > 15) {
          errors.push('duration must be an integer between 3 and 15 seconds for Kling 3.0');
        }
      } else if (duration !== 5 && duration !== 10) {
        errors.push('duration must be 5 or 10 seconds for Kling');
      }
    }
    return { valid: errors.length === 0, errors };
  }

  transformParams(params: VideoGenerateParams): unknown {
    const p = (params ?? {}) as Record<string, unknown>;
    const image =
      asString(p.firstFrame) ??
      asString(p.referenceImage) ??
      asString(p.image) ??
      (Array.isArray(p.referenceImages) ? asString(p.referenceImages[0]) : undefined);
    const imageTail = asString(p.lastFrame) ?? asString(p.image_tail);
    const model = asString(p.model) ?? asString(p.model_name) ?? asString(p.modelKey);
    const body: Record<string, unknown> = {
      model,
      model_name: model,
      prompt: asString(p.prompt),
    };
    const duration = asNumber(p.duration);
    if (duration !== undefined) body.duration = String(duration);
    const ratio = asString(p.ratio) ?? asString(p.aspect_ratio) ?? asString(p.aspectRatio);
    if (ratio) body.aspect_ratio = ratio;
    const mode = asString(p.mode);
    if (mode) body.mode = mode;
    if (typeof p.generate_audio === 'boolean' || typeof p.sound === 'boolean') {
      body.sound = p.generate_audio === true || p.sound === true ? 'on' : 'off';
    }
    if (image) body.image = image;
    if (imageTail) body.image_tail = imageTail;
    return body;
  }

  private splitTaskId(taskId: string): [string, string] {
    const index = taskId.indexOf(':');
    if (index <= 0) return ['v1/videos/text2video', taskId];
    return [taskId.slice(0, index), taskId.slice(index + 1)];
  }
}
