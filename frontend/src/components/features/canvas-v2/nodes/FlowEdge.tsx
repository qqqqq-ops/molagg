'use client'

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

import { useCanvasStore } from '../store/canvasStore'

const RUNNING = new Set(['submitting', 'pending', 'processing'])

/**
 * 画布连线：浅色轨道 + 流动的金色光带 + 一颗沿线跑的光点。
 * 上游生成节点正在跑时，这根线流得更快（「数据正在往下游走」一眼能看出来）。
 * 注册成 edgeTypes.default，所有线（包括旧画布里没写 type 的）都用它。
 */
export function FlowEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  interactionWidth,
}: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const active = useCanvasStore((state) =>
    RUNNING.has(String(state.nodes.find((node) => node.id === source)?.data?.status ?? '')),
  )
  const className = ['cv2-edge', active && 'cv2-edge-active', selected && 'cv2-edge-selected'].filter(Boolean).join(' ')

  return (
    <g className={className}>
      {/* BaseEdge 负责点选区域（interactionWidth）；它自己那条就当底下的轨道 */}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={interactionWidth} className="cv2-edge-track" />
      <path d={path} className="cv2-edge-glow" />
      <path d={path} className="cv2-edge-flow" />
      <circle r={active ? 4.5 : 3.5} className="cv2-edge-dot">
        <animateMotion dur={active ? '1s' : '2.4s'} repeatCount="indefinite" path={path} />
      </circle>
    </g>
  )
}
