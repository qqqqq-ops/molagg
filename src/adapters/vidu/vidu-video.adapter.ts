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

export class ViduVideoAdapter extends BaseVideoAdapter {
  async submitTask(params: VideoGenerateParams): Promise<string> {
    const body = this.transformParams(params) as Record<string, unknown>;
    const images = Array.isArray(body.images) ? body.images : [];
    const path = images.length > 0 ? 'ent/v2/img2video' : 'ent/v2/text2video';
    const res = await this.httpClient.post(path, body);
    const taskId = extractTaskId(res.data);
    if (!taskId) throw new Error(extractErrorMessage(res.data) ?? 'Vidu submit: missing task id');
    return taskId;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const res = await this.httpClient.get(`ent/v2/tasks/${encodeURIComponent(taskId)}`);
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
    if (!asString(p.model) && !asString(p.modelKey)) errors.push('model is required');
    if (!asString(p.prompt)) errors.push('prompt is required');
    const duration = asNumber(p.duration);
    if (duration !== undefined && ![4, 5, 8].includes(duration)) {
      errors.push('duration must be 4, 5 or 8 seconds for Vidu');
    }
    return { valid: errors.length === 0, errors };
  }

  transformParams(params: VideoGenerateParams): unknown {
    const p = (params ?? {}) as Record<string, unknown>;
    const images = Array.isArray(p.referenceImages)
      ? p.referenceImages.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : [];
    const firstFrame = asString(p.firstFrame) ?? asString(p.referenceImage);
    const body: Record<string, unknown> = {
      model: asString(p.model) ?? asString(p.modelKey),
      prompt: asString(p.prompt),
    };
    const duration = asNumber(p.duration);
    if (duration !== undefined) body.duration = duration;
    const ratio = asString(p.ratio) ?? asString(p.aspect_ratio) ?? asString(p.aspectRatio);
    if (ratio) body.aspect_ratio = ratio;
    if (firstFrame) body.images = [firstFrame, ...images];
    else if (images.length > 0) body.images = images;
    return body;
  }
}
