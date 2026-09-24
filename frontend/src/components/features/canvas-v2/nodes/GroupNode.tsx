'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { useTranslations } from '@/i18n/client'
import { cn } from '@/lib/utils/cn'

import { useCanvasStore } from '../store/canvasStore'
import { setGroupCollapsed } from '../store/grouping'

/**
 * 分组：虚线框 + 组头。组头能拖（整组跟着走）、双击折叠。
 * 右边有出口：从这里拉一根线到生成器，等于把组里每个节点都连过去。
 */
export function GroupNode({ id, data, selected }: NodeProps) {
  const t = useTranslations('canvas')
  const commit = useCanvasStore((state) => state.commit)
  const memberCount = useCanvasStore((state) => state.nodes.filter((node) => node.parentId === id).length)
  const collapsed = Boolean(data.collapsed)

  const toggle = () => commit({ nodes: setGroupCollapsed(useCanvasStore.getState().nodes, id, !collapsed) })

  return (
    <div className={cn('cv2-group', selected && 'cv2-group-selected', collapsed && 'cv2-group-collapsed')}>
      <header className="cv2-group-head" onDoubleClick={toggle}>
        <button
          type="button"
          className="cv2-group-toggle"
          title={collapsed ? t('group.expand') : t('group.collapse')}
          onClick={toggle}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <span className="cv2-node-title cv2-drag-handle">{String(data.title ?? t('nodeKinds.group'))}</span>
        <span className="cv2-node-badge">{t('group.memberCount', { count: memberCount })}</span>
      </header>
      <Handle type="source" position={Position.Right} className="cv2-handle" />
    </div>
  )
}
