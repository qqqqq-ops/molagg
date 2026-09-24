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

export class VeoVideoAdapter extends BaseVideoAdapter {
  async submitTask(params: VideoGenerateParams): Promise<string> {
    const res = await this.httpClient.post('v1/videos/generations', this.transformParams(params));
    const taskId = extractTaskId(res.data);
    if (!taskId) throw new Error(extractErrorMessage(res.data) ?? 'Veo submit: missing task id');
    return taskId;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const res = await this.httpClient.get(`v1/videos/generations/${encodeURIComponent(taskId)}`);
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
    if (duration !== undefined && (duration < 4 || duration > 16)) {
      errors.push('duration must be between 4 and 16 seconds for Veo');
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
    if (typeof p.generate_audio === 'boolean') body.generate_audio = p.generate_audio;
    if (firstFrame) body.images = [firstFrame, ...images];
    else if (images.length > 0) body.images = images;
    return body;
  }
}
