'use client'

import { Handle, Position } from '@xyflow/react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

/**
 * 所有节点共用的外壳：标题栏 + 内容区 + 左右连接点。
 * 连接点是 React Flow 的 Handle，左进右出——参考站也是这个方向。
 */

interface NodeShellProps {
  title: string
  /** 标题右边的小字，比如模型名、状态 */
  badge?: ReactNode
  /** 有些节点（便利贴）不需要连接点 */
  handles?: 'both' | 'source' | 'target' | 'none'
  selected?: boolean
  /** 出错时整个框描红 */
  invalid?: boolean
  width?: number
  className?: string
  children: ReactNode
  /** 标题栏最右边的操作按钮 */
  actions?: ReactNode
}

export function NodeShell({
  title,
  badge,
  handles = 'both',
  selected = false,
  invalid = false,
  width,
  className,
  children,
  actions,
}: NodeShellProps) {
  const showTarget = handles === 'both' || handles === 'target'
  const showSource = handles === 'both' || handles === 'source'

  return (
    <div
      className={cn('cv2-node', selected && 'cv2-node-selected', invalid && 'cv2-node-invalid', className)}
      style={width ? { width } : undefined}
    >
      {showTarget && <Handle type="target" position={Position.Left} className="cv2-handle" />}

      <header className="cv2-node-head">
        {/* drag handle 让标题栏成为唯一可拖拽区域，这样节点内的输入框才选得中文字 */}
        <span className="cv2-node-title cv2-drag-handle">{title}</span>
        {badge && <span className="cv2-node-badge">{badge}</span>}
        {actions && <span className="cv2-node-actions">{actions}</span>}
      </header>

      <div className="cv2-node-body">{children}</div>

      {showSource && <Handle type="source" position={Position.Right} className="cv2-handle" />}
    </div>
  )
}
