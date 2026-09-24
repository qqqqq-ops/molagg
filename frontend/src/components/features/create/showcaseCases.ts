import { VIDEO_MODEL_SAMPLES, type VideoModelSample } from '@/lib/prompts/videoModelSamples'

/**
 * 创作页右栏「展示案例」（参考 creative-studio 的 main-preview + preview-strip）。
 *
 * 图片案例：封面取自仓库自带配图（public/images → public/showcase 压缩版），提示词按画面反写，
 *   点缩略图把提示词带进左栏。
 * 视频案例：复用 VIDEO_MODEL_SAMPLES（带模型、时长、比例）。目前没有样片视频，
 *   `video` 留空时右栏显示文字海报、隐藏「播放样片」；生成出真实样片后放进 public/showcase/ 并填上 video / image 即可。
 */

export type CreateShowcaseCase = {
  id: string
  mode: 'image' | 'video'
  title: string
  /** 缩略图角标 / 标题后缀，如模型名或画幅 */
  tag: string
  prompt: string
  image?: string
  video?: string
  ratio?: string
  duration?: string
  sample?: VideoModelSample
}

export const IMAGE_SHOWCASE_CASES: CreateShowcaseCase[] = [
  {
    id: 'forest-fireflies',
    mode: 'image',
    title: '萤火森林',
    tag: '16:9',
    ratio: '16:9',
    image: '/showcase/forest-fireflies.jpg',
    prompt:
      '黄昏时分的奇幻森林，一条溪流从古树之间穿过，河岸长满会发光的蘑菇，萤火虫漂浮在空中，远处逆光透出金色暖调，细节丰富，电影感宽幅构图。',
  },
  {
    id: 'water-town-dusk',
    mode: 'image',
    title: '晚霞古镇',
    tag: '4:3',
    ratio: '4:3',
    image: '/showcase/water-town-dusk.jpg',
    prompt:
      '晚霞下的岭南古镇，中西合璧的钟楼与牌坊倒映在稻田水面上，粉紫色云层铺满天空，写实插画风格，宁静的黄昏氛围，前景有稻苗与水草。',
  },
  {
    id: 'cliff-pavilion',
    mode: 'image',
    title: '悬崖观景亭',
    tag: '16:9',
    ratio: '16:9',
    image: '/showcase/cliff-pavilion.jpg',
    prompt:
      '海边悬崖上的极简混凝土观景亭，严格对称构图，落地玻璃映出日落，粉橙色天空与平静的海平线，建筑摄影，广角镜头，柔和自然光。',
  },
  {
    id: 'night-window',
    mode: 'image',
    title: '窗边夜景',
    tag: '16:9',
    ratio: '16:9',
    image: '/showcase/night-window.jpg',
    prompt:
      '高层公寓卧室窗边的夜景，窗外是城市灯火与主干道车流光带，室内一盏台灯发出暖光，薄纱窗帘半掩，冷暖对比，电影感低照度摄影。',
  },
]

export const VIDEO_SHOWCASE_CASES: CreateShowcaseCase[] = VIDEO_MODEL_SAMPLES.slice(0, 4).map((sample) => ({
  id: sample.id,
  mode: 'video',
  title: sample.title,
  tag: sample.tag,
  prompt: sample.prompt,
  ratio: sample.ratio,
  duration: sample.duration,
  sample,
}))
