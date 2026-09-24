'use client'

import { useEffect, useState } from 'react'

/** 全站共用一个 1 秒的时钟：列表里几十个进度条也只有一个定时器 */
const listeners = new Set<(now: number) => void>()
let timer: number | null = null

function subscribe(listener: (now: number) => void) {
  listeners.add(listener)
  if (timer === null) {
    timer = window.setInterval(() => {
      const now = Date.now()
      listeners.forEach((fn) => fn(now))
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }
}

/** active = false 时不订阅（已结束的任务不需要每秒重渲染） */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    // 不在这里同步补一次 Date.now()：订阅后最多 1 秒就会收到第一次 tick，
    // 而同步 setState 会触发一轮级联渲染（react-hooks/set-state-in-effect）。
    return subscribe(setNow)
  }, [active])

  return now
}
