/**
 * 内置文本模型候选清单 —— 「从中转站获取」取不到时的兜底。
 *
 * ⚠️ 这是候选名单，不是权威列表。
 * 模型迭代很快（本清单整理于 2026-09），modelKey 各家中转站的写法也可能不同。
 * **优先用「从中转站获取」** —— 那个接口返回的是你的 Key 真正能用的模型，
 * 名字一定对。清单只在中转站不支持 /v1/models 时兜底。
 *
 * 每组第一个是该厂商当前的旗舰/最新款，登录页的厂商展示取的就是它。
 *
 * 不在这里配图标：厂商 logo 统一在 features/auth/showcaseVendors.ts 的
 * VENDOR_ICON 里按厂商配，避免同一家在两处各配一份。
 */

export type CatalogChatModel = {
  /** 界面显示名 */
  name: string
  /** 实际请求用的模型名，以中转站实际返回为准 */
  modelKey: string
  vendor: string
  /** 是否支持图片输入（多模态） */
  vision?: boolean
}

export type CatalogGroup = {
  region: 'overseas' | 'domestic'
  vendor: string
  models: CatalogChatModel[]
}

export const CHAT_MODEL_CATALOG: CatalogGroup[] = [
  {
    region: 'overseas',
    vendor: 'OpenAI',
    models: [
      { name: 'GPT-6 Astra', modelKey: 'gpt-6-astra', vendor: 'OpenAI', vision: true },
      { name: 'GPT-5.6 Sol', modelKey: 'gpt-5.6-sol', vendor: 'OpenAI', vision: true },
      { name: 'GPT-5.6 Terra', modelKey: 'gpt-5.6-terra', vendor: 'OpenAI', vision: true },
      { name: 'GPT-5.6 Luna', modelKey: 'gpt-5.6-luna', vendor: 'OpenAI', vision: true },
    ],
  },
  {
    region: 'overseas',
    vendor: 'Anthropic',
    models: [
      { name: 'Claude Fable 5.1', modelKey: 'claude-fable-5-1', vendor: 'Anthropic', vision: true },
      { name: 'Claude Mythos 5.1', modelKey: 'claude-mythos-5-1', vendor: 'Anthropic', vision: true },
      { name: 'Claude Opus 5', modelKey: 'claude-opus-5', vendor: 'Anthropic', vision: true },
      { name: 'Claude Sonnet 5', modelKey: 'claude-sonnet-5', vendor: 'Anthropic', vision: true },
    ],
  },
  {
    region: 'overseas',
    vendor: 'Google',
    models: [
      { name: 'Gemini 3.8 Flash', modelKey: 'gemini-3.8-flash', vendor: 'Google', vision: true },
      { name: 'Gemini 3.5 Pro', modelKey: 'gemini-3.5-pro', vendor: 'Google', vision: true },
      { name: 'Gemini 3.1 Ultra', modelKey: 'gemini-3.1-ultra', vendor: 'Google', vision: true },
    ],
  },
  {
    region: 'overseas',
    vendor: 'xAI',
    models: [
      // 模型 ID 见 docs.x.ai，是本清单里唯一经过官方文档核对的
      { name: 'Grok 4.6', modelKey: 'grok-4.6', vendor: 'xAI', vision: true },
      { name: 'Grok 4.5', modelKey: 'grok-4.5', vendor: 'xAI', vision: true },
    ],
  },
  {
    region: 'domestic',
    vendor: 'DeepSeek',
    models: [
      { name: 'DeepSeek V4.1 Flash', modelKey: 'deepseek-v4.1-flash', vendor: 'DeepSeek' },
      { name: 'DeepSeek V4 Pro', modelKey: 'deepseek-v4-pro', vendor: 'DeepSeek' },
    ],
  },
  {
    region: 'domestic',
    vendor: '阿里通义',
    models: [
      { name: '通义千问 3.7 Max', modelKey: 'qwen3.7-max', vendor: '阿里通义' },
      { name: '通义千问 3.7 Plus', modelKey: 'qwen3.7-plus', vendor: '阿里通义' },
      { name: '通义千问 3.5', modelKey: 'qwen3.5', vendor: '阿里通义', vision: true },
    ],
  },
  {
    region: 'domestic',
    vendor: '智谱',
    models: [
      { name: 'GLM-5.3', modelKey: 'glm-5.3', vendor: '智谱' },
      { name: 'GLM-5.2', modelKey: 'glm-5.2', vendor: '智谱' },
    ],
  },
  {
    region: 'domestic',
    vendor: '月之暗面',
    models: [
      { name: 'Kimi K3', modelKey: 'kimi-k3', vendor: '月之暗面' },
      { name: 'Kimi K2.7 Code', modelKey: 'kimi-k2.7-code', vendor: '月之暗面' },
    ],
  },
  {
    region: 'domestic',
    vendor: 'MiniMax',
    models: [
      { name: 'MiniMax M3', modelKey: 'minimax-m3', vendor: 'MiniMax' },
      { name: 'MiniMax M2.5', modelKey: 'minimax-m2.5', vendor: 'MiniMax' },
    ],
  },
  {
    region: 'domestic',
    vendor: '字节豆包',
    models: [{ name: '豆包 Seed 2.0 Pro', modelKey: 'doubao-seed-2.0-pro', vendor: '字节豆包' }],
  },
  {
    region: 'domestic',
    vendor: '腾讯混元',
    models: [{ name: '混元 Turbo', modelKey: 'hunyuan-turbo', vendor: '腾讯混元' }],
  },
]

export const CATALOG_MODEL_COUNT = CHAT_MODEL_CATALOG.reduce(
  (total, group) => total + group.models.length,
  0,
)
