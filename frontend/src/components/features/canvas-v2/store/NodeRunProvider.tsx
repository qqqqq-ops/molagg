'use client'

import type { ReactNode } from 'react'

import { RunnerContext } from './runnerContext'
import { useNodeRun } from './useNodeRun'

/** 整张画布共用一份 runner：节点按钮、级联执行都从这里取（原因见 useNodeRun 注释） */
export function NodeRunProvider({ children }: { children: ReactNode }) {
  const runner = useNodeRun()
  return <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>
}
