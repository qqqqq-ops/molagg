/**
 * 动画配置和变体
 * 统一管理项目中的动画效果
 */

import { Variants } from 'framer-motion'

/**
 * 页面过渡动画变体
 */
// 时长刻意压短：切页 / 切 tab 时内容要立刻可用，动画只做点缀（原 0.4–0.5s 叠上延迟，用户实测「很久才加载出来」）
export const pageTransition: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: 0.15,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
}

/**
 * 淡入动画变体
 */
export const fadeIn: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.25,
      ease: 'easeOut',
    },
  },
}

/**
 * 从下方滑入动画变体
 */
export const slideUp: Variants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
}

/**
 * 缩放动画变体
 */
export const scaleIn: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
}

/**
 * 交错动画配置
 */
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.04,
    },
  },
}

/**
 * 卡片悬停动画
 */
export const cardHover = {
  rest: {
    scale: 1,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  hover: {
    scale: 1.02,
    y: -4,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
}

/**
 * 按钮点击动画
 */
export const buttonTap = {
  scale: 0.95,
  transition: {
    duration: 0.1,
  },
}

/**
 * 动画持续时间预设
 */
export const duration = {
  fast: 0.2,
  normal: 0.3,
  slow: 0.5,
}

/**
 * 缓动函数预设
 */
export const ease = {
  smooth: [0.25, 0.1, 0.25, 1],
  spring: { type: 'spring', stiffness: 300, damping: 30 },
  bounce: { type: 'spring', stiffness: 400, damping: 10 },
}
