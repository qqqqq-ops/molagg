/**
 * 把后端异常、上游报错和网络错误归成有限几类，
 * 好让界面能给出「是谁的问题 + 下一步做什么」，而不是一句「失败，请重试」。
 *
 * 只做分类，不碰文案 —— 文案在 errors.failure.* 里按 kind 取。
 */

import { ApiClientError } from '@/lib/api/error'

export type FailureKind =
  | 'channelMissing'
  | 'auth'
  | 'network'
  | 'rateLimited'
  | 'upstream'
  | 'invalidParams'
  | 'modelRemoved'
  | 'canceled'
  | 'modalRequired'
  | 'unknown'

export type Failure = {
  kind: FailureKind
  /** 原始报错，作为细节补充展示；已能被 kind 完整表达时为空。 */
  detail: string
}

/** 渠道没配好是本地部署最常见的卡点，后端抛的是「请先配置 X 渠道的 Base URL 和 API Key」。 */
const CHANNEL_MISSING_PATTERNS = [/请先配置.*渠道/, /base\s*url/i, /api\s*key/i]

const MODEL_REMOVED_PATTERNS = [
  /^MODEL_REMOVED$/,
  /model\s+(not\s+found|disabled)/i,
  /model\s+is\s+not\s+\w+\s+type/i,
]

const INVALID_PARAMS_PATTERNS = [/invalid\s+\w+/i, /参数/, /validation/i]

const NETWORK_PATTERNS = [/network\s*error/i, /ERR_NETWORK/, /ERR_CONNECTION/, /timeout of \d+ms/i]

const RATE_LIMIT_PATTERNS = [/rate\s*limit/i, /too\s+many\s+requests/i, /请求过于频繁/]

const UPSTREAM_PATTERNS = [
  /upstream/i,
  /bad\s*gateway/i,
  /service\s+unavailable/i,
  /internal\s+server\s+error/i,
  /gateway\s*timeout/i,
]

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text))
}

/** 把上游/后端返回的那一行原始报错归类。 */
export function classifyFailureMessage(raw: string | null | undefined, code?: number): Failure {
  const text = (raw ?? '').trim()

  if (text === 'CANCELED') return { kind: 'canceled', detail: '' }
  if (text === 'MODAL') return { kind: 'modalRequired', detail: '' }

  if (!text) {
    // 没有文案时只能靠状态码判断
    if (code === 401 || code === 403) return { kind: 'auth', detail: '' }
    if (code === 429) return { kind: 'rateLimited', detail: '' }
    if (typeof code === 'number' && code >= 500) return { kind: 'upstream', detail: '' }
    return { kind: 'unknown', detail: '' }
  }

  if (matchesAny(text, CHANNEL_MISSING_PATTERNS)) return { kind: 'channelMissing', detail: text }
  if (matchesAny(text, MODEL_REMOVED_PATTERNS)) return { kind: 'modelRemoved', detail: text }
  if (matchesAny(text, NETWORK_PATTERNS)) return { kind: 'network', detail: '' }
  if (matchesAny(text, RATE_LIMIT_PATTERNS)) return { kind: 'rateLimited', detail: text }
  if (matchesAny(text, UPSTREAM_PATTERNS)) return { kind: 'upstream', detail: text }

  if (code === 401 || code === 403) return { kind: 'auth', detail: text }
  if (code === 429) return { kind: 'rateLimited', detail: text }
  if (typeof code === 'number' && code >= 500) return { kind: 'upstream', detail: text }

  if (matchesAny(text, INVALID_PARAMS_PATTERNS)) return { kind: 'invalidParams', detail: text }

  return { kind: 'unknown', detail: text }
}

type AxiosLikeError = {
  response?: { status?: number; data?: { msg?: string; message?: string } }
  message?: string
}

/** 把 catch 到的任意异常归类。 */
export function classifyFailure(error: unknown): Failure {
  if (error instanceof ApiClientError) {
    return classifyFailureMessage(error.message, error.code)
  }

  if (error && typeof error === 'object') {
    const candidate = error as AxiosLikeError
    const status = candidate.response?.status
    const message =
      candidate.response?.data?.msg ??
      candidate.response?.data?.message ??
      candidate.message ??
      ''

    if (status !== undefined || candidate.message !== undefined) {
      return classifyFailureMessage(message, status)
    }
  }

  if (error instanceof Error) return classifyFailureMessage(error.message)
  if (typeof error === 'string') return classifyFailureMessage(error)

  return { kind: 'unknown', detail: '' }
}

/** 这类失败光靠重试解决不了，需要用户去补配置。 */
export function isConfigurationFailure(kind: FailureKind) {
  return kind === 'channelMissing' || kind === 'modelRemoved'
}
