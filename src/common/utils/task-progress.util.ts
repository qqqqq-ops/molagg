import { asSqliteJsonRecord } from './sqlite-json.util';

/**
 * 任务进度：各家上游给进度的方式五花八门（progress / percent / "45%" / 0.45 / 嵌在 data、output 里），
 * 这里统一归一成 0–100，存进 providerData._progress，序列化时作为顶层 progress 字段给前端。
 * 没有进度的上游（Seedance、可灵等）不存，前端按历史耗时估算，并标注「约」。
 */

const PROGRESS_KEYS = ['progress', 'percent', 'percentage', 'progress_percent', 'progressPercent', 'task_progress'];
const STORED_PROGRESS_KEY = '_progress';

type StoredProgress = {
  value: number;
  /** 进度属于哪一次上游任务：重试后 providerTaskId 变了，旧进度就作废，不会一开场就显示 100% */
  providerTaskId: string | null;
  updatedAt: string;
};

function parseProgressValue(raw: unknown): number | undefined {
  let value: number | undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    value = raw;
  } else if (typeof raw === 'string') {
    const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*%?$/);
    if (match) value = Number(match[1]);
  }
  if (value === undefined || value < 0) return undefined;
  // 0.45 这种小数视为比例；恰好 1 有歧义，按 1% 处理（宁可低估，不提前显示满格）
  if (value > 0 && value < 1) value *= 100;
  return Math.min(100, Math.round(value * 10) / 10);
}

/**
 * 读回已经存起来的进度：存的时候已经归一成 0–100 了，这里**不能**再套「小于 1 视为比例」那条规则，
 * 否则上游用比例报进度时（0.005 = 0.5%）存下的 0.5 会被再放大成 50%，进度一开场就跳到一半。
 */
function parseStoredProgressValue(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return undefined;
  return Math.min(100, raw);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** 从上游原始响应里找进度；找不到返回 undefined */
export function extractUpstreamProgress(payload: unknown): number | undefined {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const candidates = [
    root,
    data,
    asRecord(root.output),
    asRecord(data.output),
    asRecord(data.task_result ?? root.task_result),
    asRecord(data.result ?? root.result),
  ];

  for (const source of candidates) {
    for (const key of PROGRESS_KEYS) {
      const value = parseProgressValue(source[key]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

/**
 * 把这一轮查询拿到的进度并进 providerData。
 * 进度只增不减（有的上游会在排队 / 生成阶段切换时回退到 0），没拿到进度时原样返回。
 */
export function attachTaskProgress(
  providerData: unknown,
  status: { progress?: number; providerData?: unknown },
  providerTaskId: string | null,
): unknown {
  const progress = parseProgressValue(status.progress) ?? extractUpstreamProgress(status.providerData);
  if (progress === undefined) return providerData;

  const current = asSqliteJsonRecord(providerData) ?? {};
  const previous = readStoredProgressRecord(current, providerTaskId);
  const stored: StoredProgress = {
    value: previous ? Math.max(previous.value, progress) : progress,
    providerTaskId,
    updatedAt: new Date().toISOString(),
  };
  return { ...current, [STORED_PROGRESS_KEY]: stored };
}

function readStoredProgressRecord(providerData: unknown, providerTaskId: string | null): StoredProgress | null {
  const stored = asRecord(asSqliteJsonRecord(providerData)?.[STORED_PROGRESS_KEY]);
  const value = parseStoredProgressValue(stored.value);
  if (value === undefined) return null;
  const storedTaskId = typeof stored.providerTaskId === 'string' ? stored.providerTaskId : null;
  if (storedTaskId !== providerTaskId) return null;
  return {
    value,
    providerTaskId: storedTaskId,
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : '',
  };
}

/** 序列化用：当前这次上游任务的真实进度，没有则 null */
export function readStoredTaskProgress(task: { providerData?: unknown; providerTaskId?: string | null }): number | null {
  return readStoredProgressRecord(task.providerData, task.providerTaskId ?? null)?.value ?? null;
}
