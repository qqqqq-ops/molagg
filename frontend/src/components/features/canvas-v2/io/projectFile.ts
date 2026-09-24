/**
 * 画布文件的存取与校验。
 *
 * 校验失败分四种，方便用户自己判断是文件坏了还是导错了东西。
 * 这里**只给错误码**，文案由调用方按当前语言查 canvas.errors.file.*——
 * 这是个纯函数，不该依赖 React 上下文才能报错。
 */

import { CANVAS_FILE_VERSION, type CanvasProjectFile } from '../canvasV2.types'

export type ParseErrorCode = 'invalidJson' | 'foreignFile' | 'unsupportedVersion' | 'missingGraph'

export type ParseResult =
  | { ok: true; file: CanvasProjectFile }
  /** unsupportedVersion 带上两个版本号，文案里要填进去 */
  | { ok: false; code: ParseErrorCode; version?: number; max?: number }

export function parseProjectFile(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, code: 'invalidJson' }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, code: 'invalidJson' }
  }
  const record = parsed as Record<string, unknown>

  if (record.app !== 'molagg-canvas-v2') {
    return { ok: false, code: 'foreignFile' }
  }

  const version = typeof record.version === 'number' ? record.version : 0
  if (version > CANVAS_FILE_VERSION) {
    return { ok: false, code: 'unsupportedVersion', version, max: CANVAS_FILE_VERSION }
  }

  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
    return { ok: false, code: 'missingGraph' }
  }

  return {
    ok: true,
    file: {
      version,
      app: 'molagg-canvas-v2',
      name: typeof record.name === 'string' ? record.name : undefined,
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
      nodes: record.nodes as CanvasProjectFile['nodes'],
      edges: record.edges as CanvasProjectFile['edges'],
    },
  }
}

export function downloadProjectFile(file: CanvasProjectFile, filename: string) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // 立刻 revoke 在部分浏览器里会让下载中断，推到下一帧
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}

export function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    // 这条 Error 走不到界面上（调用方 catch 掉后自己出 i18n 文案），
    // 是给控制台看的，所以写英文、不进 i18n
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'))
    reader.readAsText(file)
  })
}
