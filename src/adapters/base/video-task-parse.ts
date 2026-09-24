export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function pickString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value) return value;
  }
  return undefined;
}

export function extractVideoUrl(payload: unknown): string | undefined {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const result = asRecord(data.task_result ?? data.result ?? root.task_result ?? root.result);
  const content = asRecord(data.content ?? root.content);

  const direct =
    pickString(root, ['video_url', 'videoUrl', 'url', 'result_url', 'resultUrl']) ??
    pickString(data, ['video_url', 'videoUrl', 'url', 'result_url', 'resultUrl']) ??
    pickString(content, ['video_url', 'videoUrl', 'url']);
  if (direct) return direct;

  const videos = (result.videos ?? data.videos ?? root.videos) as unknown;
  if (Array.isArray(videos) && videos[0]) {
    if (typeof videos[0] === 'string') return videos[0];
    const first = asRecord(videos[0]);
    return pickString(first, ['url', 'video_url', 'videoUrl']);
  }

  return undefined;
}

export function extractTaskId(payload: unknown): string | undefined {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  return (
    pickString(root, ['id', 'task_id', 'taskId']) ??
    pickString(data, ['id', 'task_id', 'taskId'])
  );
}

export function mapGenericVideoStatus(value: string | undefined): 'pending' | 'processing' | 'completed' | 'failed' {
  const status = (value ?? '').toLowerCase();
  if (['succeed', 'succeeded', 'success', 'completed', 'complete', 'done'].includes(status)) return 'completed';
  if (['failed', 'error', 'fail', 'cancelled', 'canceled', 'expired'].includes(status)) return 'failed';
  if (['running', 'processing', 'in_progress', 'in-progress', 'generating'].includes(status)) return 'processing';
  return 'pending';
}

export function extractStatusValue(payload: unknown): string | undefined {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  return (
    pickString(root, ['status', 'task_status', 'taskStatus', 'state']) ??
    pickString(data, ['status', 'task_status', 'taskStatus', 'state'])
  );
}

export function extractErrorMessage(payload: unknown): string | undefined {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const error = asRecord(root.error);
  return (
    pickString(error, ['message', 'msg']) ??
    pickString(root, ['message', 'msg', 'error_message', 'errorMessage']) ??
    pickString(data, ['message', 'msg', 'error_message', 'errorMessage'])
  );
}
