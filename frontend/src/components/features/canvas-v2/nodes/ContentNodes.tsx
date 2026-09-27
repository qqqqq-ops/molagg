'use client'

import { type NodeProps } from '@xyflow/react'
import { Download, Film, Image as ImageIcon, Music, Scissors } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'

import { useTranslations } from '@/i18n/client'

import { STICKY_COLORS } from '../canvasV2.types'
import { useCanvasStore } from '../store/canvasStore'
import { NodeShell } from './NodeShell'

// 上传结果在库里存的是绝对地址 http://<host>:3000/uploads/...；画布常开在 3001，跨源会被 CORS 挡下
// （视频还带 crossOrigin，会直接放不出、显示打叉播放键，截帧也失败）。统一改成相对 /uploads/...，
// 跟着当前站点走 = 同源（3001 会把 /uploads 代理到后端），视频既能放、截帧也能用。blob: / data: 本地预览地址不匹配、原样保留。
function sameOriginUpload(url: string): string {
  return url.replace(/^https?:\/\/[^/]+(\/uploads\/)/i, '$1')
}

/** 内容类节点：文字、便利贴、Markdown、图片、视频、音频 */

function useNodePatch(id: string) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData)
  return (patch: Record<string, unknown>) => updateNodeData(id, patch)
}

export function TextNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  return (
    // 没改过标题的节点显示类型名，跟着站点语言走（store 不再把标题烤进节点数据）
    <NodeShell title={String(data.title ?? t('nodeKinds.text'))} selected={selected} width={260}>
      <textarea
        className="cv2-textarea nowheel"
        rows={4}
        value={String(data.text ?? '')}
        placeholder={t('node.text.placeholder')}
        onChange={(event) => patch({ text: event.target.value })}
      />
    </NodeShell>
  )
}

export function StickyNoteNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  const color = String(data.color ?? STICKY_COLORS[0])
  return (
    <NodeShell
      title={String(data.title ?? t('nodeKinds.stickyNote'))}
      selected={selected}
      handles="none"
      width={220}
      className="cv2-sticky"
      actions={
        <span className="cv2-sticky-colors">
          {STICKY_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={t('node.sticky.colorLabel', { color: swatch })}
              className={cnSwatch(swatch === color)}
              style={{ background: swatch }}
              onClick={() => patch({ color: swatch })}
            />
          ))}
        </span>
      }
    >
      <textarea
        className="cv2-textarea cv2-sticky-text nowheel"
        rows={5}
        style={{ borderColor: color }}
        value={String(data.text ?? '')}
        placeholder={t('node.sticky.placeholder')}
        onChange={(event) => patch({ text: event.target.value })}
      />
    </NodeShell>
  )
}

function cnSwatch(active: boolean) {
  return active ? 'cv2-swatch cv2-swatch-active' : 'cv2-swatch'
}

export function MarkdownNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  return (
    <NodeShell title={String(data.title ?? t('nodeKinds.markdown'))} selected={selected} width={300}>
      <textarea
        className="cv2-textarea cv2-mono nowheel"
        rows={7}
        value={String(data.markdown ?? '')}
        placeholder={t('node.markdown.placeholder')}
        onChange={(event) => patch({ markdown: event.target.value })}
      />
    </NodeShell>
  )
}

export function ImageNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  const url = data.url ? String(data.url) : null
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <NodeShell
      title={String(data.title ?? t('nodeKinds.image'))}
      selected={selected}
      width={260}
      actions={
        url ? (
          <a
            className="cv2-icon-button"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={t('node.image.openOriginal')}
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        ) : null
      }
    >
      {url ? (
        <img className="cv2-media" src={sameOriginUpload(url)} alt="" />
      ) : (
        <div className="cv2-placeholder">
          <ImageIcon className="h-6 w-6" />
          <span>{t('node.image.empty')}</span>
          <button type="button" className="cv2-mini-button" onClick={() => inputRef.current?.click()}>
            {t('node.pickFile')}
          </button>
          <button
            type="button"
            className="cv2-mini-button"
            onClick={() => {
              const input = window.prompt(t('node.pastePrompt'))
              if (input) patch({ url: input.trim() })
            }}
          >
            {t('node.pasteUrl')}
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          // 本地文件直接转 data URL 放进节点；导出画布时会一起带走
          const reader = new FileReader()
          reader.onload = () => patch({ url: String(reader.result ?? '') })
          reader.onerror = () => toast.error(t('errors.readImageFailed'))
          reader.readAsDataURL(file)
        }}
      />
    </NodeShell>
  )
}

export function VideoNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  const addNode = useCanvasStore((state) => state.addNode)
  const nodes = useCanvasStore((state) => state.nodes)
  const url = data.url ? String(data.url) : null
  const videoRef = useRef<HTMLVideoElement>(null)

  /** 截当前帧成图片节点——参考站的「接龙下一段」就是靠这个 */
  const captureFrame = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      toast.error(t('errors.videoNotReady'))
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    let dataUrl: string
    try {
      dataUrl = canvas.toDataURL('image/png')
    } catch {
      // 跨域视频没有 CORS 头时 canvas 会被污染，toDataURL 直接抛
      toast.error(t('errors.captureFailed'))
      return
    }
    const self = nodes.find((node) => node.id === id)
    addNode(
      'image',
      { x: (self?.position.x ?? 0) + 300, y: self?.position.y ?? 0 },
      { url: dataUrl, title: t('node.video.frameTitle'), sourceNodeId: id },
    )
    toast.success(t('messages.frameCaptured'))
  }

  return (
    <NodeShell
      title={String(data.title ?? t('nodeKinds.video'))}
      selected={selected}
      width={280}
      actions={
        url ? (
          <button type="button" className="cv2-icon-button" onClick={captureFrame} title={t('node.video.capture')}>
            <Scissors className="h-3.5 w-3.5" />
          </button>
        ) : null
      }
    >
      {url ? (
        <video ref={videoRef} className="cv2-media" src={sameOriginUpload(url)} controls crossOrigin="anonymous" />
      ) : (
        <div className="cv2-placeholder">
          <Film className="h-6 w-6" />
          <span>{t('node.video.empty')}</span>
          <button
            type="button"
            className="cv2-mini-button"
            onClick={() => {
              const input = window.prompt(t('node.pastePrompt'))
              if (input) patch({ url: input.trim() })
            }}
          >
            {t('node.pasteUrl')}
          </button>
        </div>
      )}
    </NodeShell>
  )
}

export function AudioNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const patch = useNodePatch(id)
  const url = data.url ? String(data.url) : null
  return (
    <NodeShell title={String(data.title ?? t('nodeKinds.audio'))} selected={selected} width={260}>
      {url ? (
        <audio className="cv2-audio" src={sameOriginUpload(url)} controls />
      ) : (
        <div className="cv2-placeholder">
          <Music className="h-6 w-6" />
          <span>{t('node.audio.empty')}</span>
          <button
            type="button"
            className="cv2-mini-button"
            onClick={() => {
              const input = window.prompt(t('node.pastePrompt'))
              if (input) patch({ url: input.trim() })
            }}
          >
            {t('node.pasteUrl')}
          </button>
        </div>
      )}
    </NodeShell>
  )
}
