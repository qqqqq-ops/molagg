/**
 * 文本模型中转站偶尔回 502 / 503 / 504（上游临时不可用），隔几秒原样再发一次通常就好了。
 * 只重试这三种；400、401、429 之类是请求本身或额度的问题，重试没用。
 */
export const TRANSIENT_UPSTREAM_STATUSES = new Set([502, 503, 504]);

const RETRY_DELAYS_MS = [2_000, 5_000];

export const TRANSIENT_UPSTREAM_MESSAGE = '文本模型的中转站暂时不可用，已自动重试 3 次，请过一会儿再试';

export async function retryOnTransientStatus<T>(
  attempt: () => Promise<T>,
  statusOf: (result: T) => number,
  discard?: (result: T) => unknown,
): Promise<T> {
  for (let i = 0; ; i += 1) {
    const result = await attempt();
    const delay = RETRY_DELAYS_MS[i];
    if (delay === undefined || !TRANSIENT_UPSTREAM_STATUSES.has(statusOf(result))) return result;
    // 没读的响应体要释放掉，不然连接一直占着
    await Promise.resolve(discard?.(result)).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
