/**
 * 把整张画布（全部节点，不只是当前看到的那一块）导出成一张 PNG。
 *
 * 做法照 React Flow 官方示例：算出所有节点的外框，临时把视口变换改成「刚好装下外框」，
 * 再用 html-to-image 截 .react-flow__viewport。
 *
 * 只给结果码，文案由调用方查 i18n（同 projectFile）。
 */

import { getViewportForBounds, type Rect } from '@xyflow/react'
import { toPng } from 'html-to-image'

/** 导出图最长边；再大浏览器画布会爆内存 */
const MAX_SIDE = 4096
const PADDING = 48

/** 跨域图片读不回来时用的 1×1 透明占位，免得一张图拖垮整次导出 */
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export type ExportPngResult = 'ok' | 'empty' | 'failed'

export async function exportCanvasPng(bounds: Rect | null, filename: string): Promise<ExportPngResult> {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return 'empty'
  const viewportEl = document.querySelector<HTMLElement>('.cv2-board .react-flow__viewport')
  if (!viewportEl) return 'failed'

  const scale = Math.min(1, MAX_SIDE / (bounds.width + PADDING * 2), MAX_SIDE / (bounds.height + PADDING * 2))
  const width = Math.round((bounds.width + PADDING * 2) * scale)
  const height = Math.round((bounds.height + PADDING * 2) * scale)
  const viewport = getViewportForBounds(bounds, width, height, 0.05, 2, PADDING / Math.max(width, height))
  const background = getComputedStyle(viewportEl).getPropertyValue('--cv2-canvas').trim() || '#e9e9e6'

  try {
    const dataUrl = await toPng(viewportEl, {
      backgroundColor: background,
      width,
      height,
      pixelRatio: 1,
      imagePlaceholder: TRANSPARENT_PIXEL,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    })
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    return 'ok'
  } catch {
    return 'failed'
  }
}
