/**
 * 淡入动画组件
 * 用于元素进入视图时的淡入效果
 */

'use client'

import { motion } from 'framer-motion'
import { fadeIn, slideUp, scaleIn } from '@/lib/utils/animations'
import type { Variants } from 'framer-motion'

interface FadeInProps {
  children: React.ReactNode
  className?: string
  delay?: number
  variant?: 'fade' | 'slide' | 'scale'
}

const variants: Record<string, Variants> = {
  fade: fadeIn,
  slide: slideUp,
  scale: scaleIn,
}

export function FadeIn({
  children,
  className,
  delay = 0,
  variant = 'fade',
}: FadeInProps) {
  const selectedVariant = variants[variant]

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={selectedVariant}
      // 各页面写死了 0.1–0.4s 的错峰延迟，叠起来要等近 1 秒；统一按 1/4 生效，保留错峰感但不拖沓
      transition={{ delay: delay * 0.25 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
