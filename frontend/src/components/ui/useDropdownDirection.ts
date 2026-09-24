'use client'

import { useEffect, useState, type CSSProperties, type RefObject } from 'react'

const VIEWPORT_GAP = 12
const MENU_OFFSET = 8
const MIN_SPACE_TO_FLIP = 180

interface UseDropdownDirectionOptions {
  containerRef: RefObject<HTMLElement | null>
  isOpen: boolean
  preferredMaxHeight?: number
}

export function useDropdownDirection({
  containerRef,
  isOpen,
  preferredMaxHeight = 320,
}: UseDropdownDirectionOptions) {
  const [openUpwards, setOpenUpwards] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return

    const updateDirection = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const spaceAbove = Math.max(0, rect.top - VIEWPORT_GAP - MENU_OFFSET)
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - VIEWPORT_GAP - MENU_OFFSET)
      const shouldOpenUpwards = spaceBelow < MIN_SPACE_TO_FLIP && spaceAbove > spaceBelow
      const availableSpace = shouldOpenUpwards ? spaceAbove : spaceBelow
      const left = Math.max(VIEWPORT_GAP, rect.left)
      const width = Math.max(0, Math.min(rect.width, window.innerWidth - left - VIEWPORT_GAP))

      setOpenUpwards(shouldOpenUpwards)
      setMenuStyle({
        position: 'fixed',
        left,
        width,
        maxHeight: Math.max(0, Math.min(preferredMaxHeight, availableSpace)),
        zIndex: 10010,
        ...(shouldOpenUpwards
          ? { bottom: window.innerHeight - rect.top + MENU_OFFSET }
          : { top: rect.bottom + MENU_OFFSET }),
      })
    }

    // 捕获阶段会收到菜单自己内部的滚动 —— 那不是页面在动，不用重新定位
    const handleScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest('.enhanced-select-menu')) return
      updateDirection()
    }

    updateDirection()
    window.addEventListener('resize', updateDirection)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('resize', updateDirection)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [containerRef, isOpen, preferredMaxHeight])

  useEffect(() => {
    if (isOpen) return
    setOpenUpwards(false)
    setMenuStyle({})
  }, [isOpen, preferredMaxHeight])

  return { openUpwards, menuStyle }
}
