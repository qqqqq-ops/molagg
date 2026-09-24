import { createContext, useContext } from 'react'

import type { useNodeRun } from './useNodeRun'

type Runner = ReturnType<typeof useNodeRun>

export const RunnerContext = createContext<Runner | null>(null)

/** 取整张画布共用的那一份 runner（由 NodeRunProvider 提供，原因见 useNodeRun 注释） */
export function useRunner(): Runner {
  const runner = useContext(RunnerContext)
  // 这条只会在开发时写错组件层级才出现，给控制台看，不进 i18n
  if (!runner) throw new Error('useRunner must be used inside NodeRunProvider')
  return runner
}
