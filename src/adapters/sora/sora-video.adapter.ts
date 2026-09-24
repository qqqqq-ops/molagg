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

export class SoraVideoAdapter extends BaseVideoAdapter {
  async submitTask(params: VideoGenerateParams): Promise<string> {
    const res = await this.httpClient.post('v1/videos', this.transformParams(params));
    const taskId = extractTaskId(res.data);
    if (!taskId) throw new Error(extractErrorMessage(res.data) ?? 'Sora submit: missing video id');
    return taskId;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const res = await this.httpClient.get(`v1/videos/${encodeURIComponent(taskId)}`);
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

  async cancelTask(taskId: string): Promise<void> {
    try {
      await this.httpClient.delete(`v1/videos/${encodeURIComponent(taskId)}`);
    } catch {
      return;
    }
  }

  validateParams(params: unknown): ValidationResult {
    const p = (params ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    if (!asString(p.model) && !asString(p.modelKey)) errors.push('model is required');
    if (!asString(p.prompt)) errors.push('prompt is required');
    const seconds = asNumber(p.duration) ?? asNumber(p.seconds);
    if (seconds !== undefined && ![4, 8, 12, 16, 20].includes(seconds)) {
      errors.push('duration/seconds must be 4, 8, 12, 16 or 20 for Sora');
    }
    return { valid: errors.length === 0, errors };
  }

  transformParams(params: VideoGenerateParams): unknown {
    const p = (params ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {
      model: asString(p.model) ?? asString(p.modelKey),
      prompt: asString(p.prompt),
    };
    const seconds = asNumber(p.duration) ?? asNumber(p.seconds);
    if (seconds !== undefined) body.seconds = String(seconds);
    const size = asString(p.size) ?? asString(p.resolution);
    if (size) body.size = size;
    const image =
      asString(p.firstFrame) ??
      asString(p.referenceImage) ??
      (Array.isArray(p.referenceImages) ? asString(p.referenceImages[0]) : undefined);
    if (image) body.input_reference = image;
    return body;
  }
}
