/**
 * 已上传素材和当前模型合不合得来。
 *
 * 产品决定（用户原话）：**换模型不要把已上传的素材冲掉**——
 * 用户可能传了十张图，换个模型就全没了、还得重选一遍，太烦。
 * 改成留着不动，点「生成」的时候再拦下来，明确告诉他这个模型不支持。
 *
 * 所以这里只负责「判断 + 给出说法」，不负责清理。
 */

export type AssetKind = 'image' | 'video' | 'audio' | 'frame'

export type AssetCheck = {
  kind: AssetKind
  /** 当前有几个（上传的 + 从项目素材库选的，调用方先加好） */
  count: number
  /** 当前模型收不收这类素材 */
  supported: boolean
  /** 最多几个；不填或 0 表示不限 */
  max?: number
}

export type AssetIssue =
  | { reason: 'unsupported'; kind: AssetKind }
  | { reason: 'overLimit'; kind: AssetKind; max: number; count: number }

/**
 * 找出第一个说不过去的地方。
 * 「完全不支持」比「超数量」更根本，所以先扫一轮不支持的，再扫超限的——
 * 否则一个不支持参考图的模型可能先报「最多 0 张」，看着莫名其妙。
 */
export function findAssetIssue(checks: AssetCheck[]): AssetIssue | null {
  for (const check of checks) {
    if (check.count > 0 && !check.supported) {
      return { reason: 'unsupported', kind: check.kind }
    }
  }
  for (const check of checks) {
    if (!check.supported) continue
    const max = check.max ?? 0
    if (max > 0 && check.count > max) {
      return { reason: 'overLimit', kind: check.kind, max, count: check.count }
    }
  }
  return null
}

/** i18n key + 插值参数，交给调用方去 t() */
export function describeAssetIssue(issue: AssetIssue) {
  const kindKey = `form.assetKind.${issue.kind}`
  if (issue.reason === 'unsupported') {
    return { key: 'errors.assetUnsupported', kindKey, params: {} as Record<string, unknown> }
  }
  return {
    key: 'errors.assetOverLimit',
    kindKey,
    params: { max: issue.max, count: issue.count } as Record<string, unknown>,
  }
}
