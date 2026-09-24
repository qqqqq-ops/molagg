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

function isMiniMaxH3(model: string | undefined) {
  const raw = (model ?? '').toLowerCase();
  return raw.includes('minimax-h3') || raw.includes('h3');
}

export class HailuoVideoAdapter extends BaseVideoAdapter {
  async submitTask(params: VideoGenerateParams): Promise<string> {
    const body = this.transformParams(params) as Record<string, unknown>;
    const model = asString(body.model);
    const path = isMiniMaxH3(model) ? 'v2/video_generation' : 'v1/video_generation';
    const res = await this.httpClient.post(path, body);
    const taskId = extractTaskId(res.data);
    if (!taskId) throw new Error(extractErrorMessage(res.data) ?? 'Hailuo submit: missing task id');
    return taskId;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const res = await this.httpClient.get('v1/query/video_generation', {
      params: { task_id: taskId },
    });
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
    const model = asString(p.model) ?? asString(p.modelKey);
    if (duration !== undefined) {
      if (isMiniMaxH3(model)) {
        if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
          errors.push('duration must be an integer between 4 and 15 seconds for MiniMax H3');
        }
      } else if (![6, 10].includes(duration)) {
        errors.push('duration must be 6 or 10 seconds for Hailuo');
      }
    }
    return { valid: errors.length === 0, errors };
  }

  transformParams(params: VideoGenerateParams): unknown {
    const p = (params ?? {}) as Record<string, unknown>;
    const model = asString(p.model) ?? asString(p.modelKey);
    const prompt = asString(p.prompt);
    const duration = asNumber(p.duration);
    const resolution = asString(p.resolution);
    const firstFrame =
      asString(p.firstFrame) ??
      asString(p.referenceImage) ??
      (Array.isArray(p.referenceImages) ? asString(p.referenceImages[0]) : undefined);
    const lastFrame = asString(p.lastFrame);

    if (isMiniMaxH3(model)) {
      const content: Array<Record<string, unknown>> = [];
      if (prompt) content.push({ type: 'text', text: prompt });
      if (firstFrame) {
        content.push({
          type: 'image_url',
          image_url: { url: firstFrame },
          role: 'first_frame',
        });
      }
      if (lastFrame) {
        content.push({
          type: 'image_url',
          image_url: { url: lastFrame },
          role: 'last_frame',
        });
      }
      const body: Record<string, unknown> = { model, content };
      if (duration !== undefined) body.duration = duration;
      if (resolution) body.resolution = resolution === '1080p' ? '2K' : resolution.toUpperCase();
      const ratio = asString(p.ratio) ?? asString(p.aspect_ratio) ?? asString(p.aspectRatio);
      if (ratio) body.ratio = firstFrame ? 'adaptive' : ratio;
      return body;
    }

    const body: Record<string, unknown> = { model, prompt };
    if (duration !== undefined) body.duration = duration;
    if (resolution) body.resolution = resolution.toUpperCase();
    if (firstFrame) body.first_frame_image = firstFrame;
    if (lastFrame) body.last_frame_image = lastFrame;
    return body;
  }
}
