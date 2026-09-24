export type LandingMode = 'image' | 'video'

export type LandingHomeCopy = {
  enterCreate: string
  imageMode: string
  imagePlaceholder: string
  subtitle: string
  title: string
  videoMode: string
  videoPlaceholder: string
  workspace: string
  trySample: string
  generate: string
  advanced: string
  advancedHint: string
  ratioLabel: string
  ratioImageDefault: string
  ratioVideoDefault: string
  ratioFollowReference: string
  addReference: string
  removeReference: string
  referenceLimit: string
  modelLabel: string
  countLabel: string
  durationLabel: string
  secondsUnit: string
  /** 时长被上游锁死时的说明，{seconds} 为秒数 */
  fixedDuration: string
  imageUnit: string
  sizeLabel: string
  sizeSquare: string
  sizeLandscape: string
  sizePortrait: string
  tierLabel: string
  tierStandard: string
  tierRealistic: string
  loadingModels: string
  noModels: string
  noReferenceModels: string
  configureChannel: string
  loginRequired: string
  statusQueued: string
  statusRunning: string
  statusFailed: string
  openResult: string
  viewAllTasks: string
  clearResults: string
  submitting: string
}

export const HOME_NAV_TRANSITION_MS = 520
/**
 * 首屏兜底背景一律用仓库内资源：离线部署和国内网络下，外链图会让首页白屏。
 * 用户自己有完成的作品后，LandingHomePage 会优先用他的作品覆盖这里。
 *
 * 图片来自 Unsplash（Unsplash License：免费商用、无需署名），下载到本地使用，
 * 2560px 宽 JPG。张数保持 5 张，轮播/淡入淡出/缓慢放大全在 CSS 与 Shell 里，与图片无关。
 *   bg-1 Mukul Joshi   https://unsplash.com/photos/z1x7Pq1Bxbg
 *   bg-2 Hiep Duong    https://unsplash.com/photos/mm6VFRGTqWk
 *   bg-3 Brad Stell    https://unsplash.com/photos/8FijRzqByMc
 *   bg-4 Johny Goerend https://unsplash.com/photos/2XpixHtHmVc
 *   bg-5 Jose Rago     https://unsplash.com/photos/Z7Oit1N9Zr8
 */
export const HOME_HERO_IMAGE_BACKGROUNDS = [
  '/images/landing/bg-1-lake-dusk.jpg',
  '/images/landing/bg-2-neon-street.jpg',
  '/images/landing/bg-3-dunes.jpg',
  '/images/landing/bg-4-aurora.jpg',
  '/images/landing/bg-5-coast-twilight.jpg',
]

/**
 * 仓库里没有可用作背景的本地视频，留空即关闭视频兜底
 * （消费侧会过滤空串）。用户生成过视频后会自动补上。
 */
export const HOME_HERO_VIDEO_BACKGROUND = ''


export type LandingImageSample = {
  id: string
  tag: string
  prompt: string
}

/**
 * 首屏图片样本。不走模型绑定 —— 图片模型之间提示词通用，
 * 所以只带 prompt 过去，落到创作页由用户选模型（视频样本不同，它要指定模型和时长）。
 */
export const LANDING_IMAGE_SAMPLES: LandingImageSample[] = [
  {
    id: 'portrait-cinematic',
    tag: '人物肖像',
    prompt:
      '侧光下的东方女性半身肖像，浅景深虚化背景，皮肤质感细腻，暖色调电影感调色，85mm 镜头，高清。',
  },
  {
    id: 'product-poster',
    tag: '产品海报',
    prompt:
      '深色大理石台面上的玻璃香水瓶，左侧一束硬光扫过瓶身，反射干净，极简构图，高端广告质感，浅景深。',
  },
  {
    id: 'landscape-ink',
    tag: '山水场景',
    prompt:
      '云海之上的古亭，远山层叠，日出暖光穿透雾气，水墨笔触与写实光影结合，宽幅构图。',
  },
  {
    id: 'cyberpunk-street',
    tag: '赛博城市',
    prompt:
      '雨夜赛博朋克街道，霓虹招牌在湿地面上拉出倒影，空气中有雾，强对比电影打光，细节丰富。',
  },
  {
    id: 'illustration-flat',
    tag: '扁平插画',
    prompt:
      '扁平几何风格插画，一只猫坐在窗台上看城市天际线，低饱和配色，粗颗粒纸张质感，构图干净。',
  },
]

export function getLandingHomeCopy(locale: string): LandingHomeCopy {
  const isZh = locale.toLowerCase().startsWith('zh')

  if (isZh) {
    return {
      title: '重塑你的想象力',
      subtitle: '一键生成惊艳的超清图像与动态视频，在色彩秩序里保留作品本身的光感与节奏。',
      enterCreate: '进入创作',
      workspace: '工作台',
      imageMode: '图片生成',
      videoMode: '视频生成',
      imagePlaceholder: '描述你想要生成的图像画面细节...',
      videoPlaceholder: '描述视频的动作轨迹、情绪推进与镜头语言...',
      trySample: '或点一条样本直接试',
      generate: '生成',
      advanced: '进入高级版',
      advancedHint: '改比例、画质、首尾帧等更多参数请进高级版',
      ratioLabel: '比例：',
      ratioImageDefault: '1:1 方图',
      ratioVideoDefault: '16:9 横屏',
      ratioFollowReference: '跟随参考图',
      addReference: '添加参考图',
      removeReference: '移除参考图',
      referenceLimit: '最多 {max} 张参考图',
      modelLabel: '模型',
      countLabel: '张数',
      durationLabel: '时长',
      secondsUnit: '秒',
      fixedDuration: '固定 {seconds} 秒一条',
      imageUnit: '张',
      sizeLabel: '比例',
      sizeSquare: '1:1 方图',
      sizeLandscape: '3:2 横版',
      sizePortrait: '2:3 竖版',
      tierLabel: '画质',
      tierStandard: '通用',
      tierRealistic: '写实增强',
      loadingModels: '正在读取模型…',
      noModels: '还没有可用模型',
      noReferenceModels: '当前没有支持参考图的模型，移除参考图或去配置渠道',
      configureChannel: '去配置渠道',
      loginRequired: '登录后就能直接生成',
      statusQueued: '排队中',
      statusRunning: '生成中',
      statusFailed: '生成失败',
      openResult: '查看原文件',
      viewAllTasks: '在任务队列查看全部',
      clearResults: '清空结果',
      submitting: '提交中…',
    }
  }

  return {
    title: 'Reshape Your Imagination',
    subtitle: 'Generate cinematic images and motion-rich videos in one click, while the interface stays crisp in a visual system.',
    enterCreate: 'Create',
    workspace: 'Workspace',
    imageMode: 'Image',
    videoMode: 'Video',
    imagePlaceholder: 'Describe the image you want to create...',
    videoPlaceholder: 'Describe motion, emotion, and camera language for the video...',
    trySample: 'Or tap a sample to try',
    generate: 'Generate',
    advanced: 'Open Advanced',
    advancedHint: 'Aspect ratio, quality, first/last frames and more are in Advanced',
    ratioLabel: 'Ratio: ',
    ratioImageDefault: '1:1 square',
    ratioVideoDefault: '16:9 landscape',
    ratioFollowReference: 'follows reference image',
    addReference: 'Add reference image',
    removeReference: 'Remove reference image',
    referenceLimit: 'Up to {max} reference images',
    modelLabel: 'Model',
    countLabel: 'Count',
    durationLabel: 'Duration',
    secondsUnit: 's',
    fixedDuration: 'Fixed {seconds}s per clip',
    imageUnit: '',
    sizeLabel: 'Ratio',
    sizeSquare: '1:1 square',
    sizeLandscape: '3:2 landscape',
    sizePortrait: '2:3 portrait',
    tierLabel: 'Quality',
    tierStandard: 'Standard',
    tierRealistic: 'Realistic+',
    loadingModels: 'Loading models…',
    noModels: 'No model available yet',
    noReferenceModels: 'No model here accepts reference images. Remove it or configure a channel.',
    configureChannel: 'Configure channel',
    loginRequired: 'Sign in to generate right here',
    statusQueued: 'Queued',
    statusRunning: 'Generating',
    statusFailed: 'Failed',
    openResult: 'Open file',
    viewAllTasks: 'View all in Tasks',
    clearResults: 'Clear',
    submitting: 'Submitting…',
  }
}

export function buildCreateHref(locale: string, mode: LandingMode, prompt: string, sampleId?: string) {
  const params = new URLSearchParams()
  params.set('mode', mode)

  const normalizedPrompt = prompt.trim()
  if (normalizedPrompt) {
    params.set('prompt', normalizedPrompt)
  }
  if (sampleId) {
    params.set('sample', sampleId)
  }

  const query = params.toString()
  return `/${locale}/create${query ? `?${query}` : ''}`
}
