import { VIDEO_MODEL_SAMPLES, type VideoModelSample } from '@/lib/prompts/videoModelSamples'

/**
 * 创作页右栏「展示案例」（参考 creative-studio 的 main-preview + preview-strip）。
 *
 * 图片案例：封面取自仓库自带配图（public/images → public/showcase 压缩版），提示词按画面反写，
 *   点缩略图把提示词带进左栏。
 * 视频案例：提示词来自 VIDEO_MODEL_SAMPLES，样片已真实生成（见下方 VIDEO_SHOWCASE_CASES 的注释）。
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
  /** 参考创作案例：生成时用的参考图，舞台角落里并排展示「参考图 → 成片」 */
  reference?: string
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

/**
 * 视频案例的样片：2026-09-24 用站长的 Molagg 中转站（Seedance 2.5 按次，30 秒一条）真实生成，
 * 原文件未压缩，放在 public/showcase/case-<id>.mp4，封面是第 3 秒截的一帧（case-<id>.jpg）。
 * 提示词原样沿用 VIDEO_MODEL_SAMPLES；因为实际是 Seedance 2.5 生成的，角标 / 时长 / 点击后选的模型都按实际来，
 * 不再显示原来的「可灵 3.0 / 万相 3.0」——点了能照着复现同样的效果。
 */
const GENERATED_VIDEO_CASE_IDS = ['seedance-25-story', 'seedance-20-product', 'kling-30-motion', 'wan-30-landscape']
const GENERATED_MODEL_KEY = 'seedance-2-5-special'
const GENERATED_DURATION = '30'

export const VIDEO_SHOWCASE_CASES: CreateShowcaseCase[] = GENERATED_VIDEO_CASE_IDS.map((id) => {
  const base = VIDEO_MODEL_SAMPLES.find((sample) => sample.id === id)!
  const sample: VideoModelSample = {
    ...base,
    tag: 'Seedance 2.5',
    modelKeyIncludes: [GENERATED_MODEL_KEY],
    duration: GENERATED_DURATION,
  }
  return {
    id,
    mode: 'video',
    title: base.title,
    tag: sample.tag,
    prompt: base.prompt,
    ratio: base.ratio,
    duration: GENERATED_DURATION,
    image: `/showcase/case-${id}.jpg`,
    video: `/showcase/case-${id}.mp4`,
    sample,
  }
})

/**
 * 参考创作的样片：2026-09-24 站长先在 draw.opusapi.xyz 用写实增强生成 4 张参考图（public/showcase/ref-<id>.jpg），
 * 再用 Molagg Seedance 2.5 的参考模式（mode=reference）各生成一条 30 秒视频，原文件未压缩。
 * 参考创作界面里暂时还没有 Molagg（要等部署后图片有公网地址），所以点案例只带提示词和比例，不切模型。
 */
// version：同名文件换过内容时 +1，地址带上 ?v=，浏览器里的旧缓存就不会顶着不换（雨后女孩 2026-09-24 重做过一次）
const REFERENCE_CASES: Array<{ id: string; title: string; prompt: string; version?: number }> = [
  {
    id: 'landscape',
    title: '极光雪山',
    prompt:
      '以参考图的雪山、黑色冰滩和绿色极光为场景，保持同样的色调与构图风格。0-10秒：镜头贴近冰面缓缓推进，碎冰上反射极光，水面倒影微微荡漾；10-20秒：镜头慢慢抬升，越过冰滩，极光在夜空中流动变化，由绿渐变出淡紫色边缘；20-30秒：镜头缓慢环绕雪山，满天星空下一颗流星划过天际。写实风光，静谧，缓慢运镜，电影质感。',
  },
  {
    id: 'person',
    title: '雨后女孩',
    version: 2,
    prompt:
      '保持参考图中女孩的长相、短发、黄色雨衣、红色雨靴和棕色书包完全一致，场景就是参考图里这条雨后的城市街道，全程同一条街、同一个人，脸部始终清晰可见。0-10秒：中景，女孩站在湿漉漉的街道中间，面向镜头，细雨落在雨衣帽檐上，她伸出手接雨滴，低头看着掌心笑了；10-20秒：她沿着街道朝镜头方向轻快地走来，镜头平稳后退跟拍，雨靴踩过浅浅的水洼溅起小水花，路面倒映着她黄色的身影；20-30秒：雨渐渐停了，云层裂开，一束阳光照在她身上，她停下脚步抬头望向天空，再转回来对着镜头开心地笑，镜头缓缓推近到半身近景。写实电影感，自然光，色彩清新，运镜平稳，人物始终在画面中心，不要玻璃反光和倒影人脸，不要远景小人。',
  },
  {
    id: 'animal',
    title: '老街柴犬',
    prompt:
      '保持参考图中柴犬的外貌、毛色和红色针织围巾一致，场景是参考图里黄昏的老街石板路。0-10秒：柴犬坐在路边，耳朵动了动，转头看向远处亮起的灯笼；10-20秒：它起身沿着石板路小跑，尾巴摇晃，围巾随风飘动，路边店铺的暖光掠过它的身体；20-30秒：它在一家店门口停下坐好，回头看向镜头，镜头慢推到面部特写。暖色调，浅景深，写实电影感。',
  },
  {
    id: 'train',
    title: '山谷火车',
    prompt:
      '保持参考图中 207 号黑色蒸汽火车的外观、红色车轮、黄铜细节和车身字样一致，场景是参考图里的秋季山谷铁路。0-10秒：火车停在铁轨上，烟囱冒出白色蒸汽，汽笛响起，车轮开始缓缓转动；10-20秒：镜头低角度跟随车轮和连杆特写，火车加速驶出，碎石微微震动；20-30秒：航拍跟随火车穿过金黄色的山林，蒸汽在身后拉出长长的白带，镜头慢慢拉远露出整片雪山。史诗感，写实，电影级调色，平稳运镜。',
  },
]

export const REFERENCE_SHOWCASE_CASES: CreateShowcaseCase[] = REFERENCE_CASES.map((item) => {
  const query = item.version ? `?v=${item.version}` : ''
  return {
    id: `ref-${item.id}`,
    mode: 'video',
    title: item.title,
    tag: 'Seedance 2.5',
    prompt: item.prompt,
    ratio: '16:9',
    duration: GENERATED_DURATION,
    image: `/showcase/case-ref-${item.id}.jpg${query}`,
    video: `/showcase/case-ref-${item.id}.mp4${query}`,
    reference: `/showcase/ref-${item.id}.jpg`,
  }
})
