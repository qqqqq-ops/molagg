/**
 * 对齐参考线：拖一个节点时，它的左/中/右、上/中/下贴近别的节点同一条线，就吸过去并画出那条线。
 * 纯几何计算，画线由组件负责。
 */

export type Rect = { x: number; y: number; width: number; height: number }

export type Alignment = {
  /** 吸附后的左上角；某个方向没吸上就保持原值 */
  x: number
  y: number
  /** 竖线的 x、横线的 y（画布坐标）；没吸上为 null */
  vertical: number | null
  horizontal: number | null
}

const xAnchors = (rect: Rect) => [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
const yAnchors = (rect: Rect) => [rect.y, rect.y + rect.height / 2, rect.y + rect.height]

/**
 * @param threshold 画布坐标下多近算贴上；调用方按缩放换算，保证屏幕上手感一致
 */
export function computeAlignment(dragged: Rect, others: Rect[], threshold: number): Alignment {
  let bestX: { delta: number; line: number } | null = null
  let bestY: { delta: number; line: number } | null = null

  const mine = { x: xAnchors(dragged), y: yAnchors(dragged) }
  for (const other of others) {
    for (const line of xAnchors(other)) {
      for (const anchor of mine.x) {
        const delta = line - anchor
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, line }
      }
    }
    for (const line of yAnchors(other)) {
      for (const anchor of mine.y) {
        const delta = line - anchor
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, line }
      }
    }
  }

  return {
    x: dragged.x + (bestX?.delta ?? 0),
    y: dragged.y + (bestY?.delta ?? 0),
    vertical: bestX?.line ?? null,
    horizontal: bestY?.line ?? null,
  }
}
