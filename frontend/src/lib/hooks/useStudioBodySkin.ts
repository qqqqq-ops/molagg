'use client'

import { useEffect } from 'react'

const STUDIO_BODY_CLASSES = ['studio-skin', 'studio-portal']

/**
 * 工作台页面（创作页、任务队列、画布）：下拉、弹窗、抽屉这些弹层都 portal 到 body，不在页面根节点里，
 * 只能靠 body 带上皮肤类让它们也用工作台配色。离开页面即移除。
 *
 * 深浅不在这里定：跟随站点主题（html 上的 .dark，默认跟随系统）。
 * 以前这里会给 body 加 .dark 固定深色；2026-09-23 用户要求改成跟随系统。
 */
export function useStudioBodySkin(extraClasses: string[] = []) {
  const extraKey = extraClasses.join(' ')

  useEffect(() => {
    const classes = [...STUDIO_BODY_CLASSES, ...extraKey.split(' ').filter(Boolean)]
    document.body.classList.add(...classes)
    return () => {
      document.body.classList.remove(...classes)
    }
  }, [extraKey])
}
