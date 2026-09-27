/**
 * Molagg 视频提交前的提示词预审。
 *
 * 为什么要它：Molagg 的内容审核发生在生成之后——踩了雷要白等约一小时才被拒（content_blocked），
 * 结果还是空的。已知会被拒的两类（见任务 #11：「超写实真人 + 连续挥剑斩杀敌方士兵」）：真人写实、杀戮暴力。
 * 这里在提交前先扫一遍，命中就提醒 + 给改写建议，让用户自己决定要不要仍旧提交——
 * 策略是黑箱，硬拦会误伤，所以只**警告可强行提交**，不替用户拦死。
 * 只对 Molagg（provider === 'molagg'）生效，别家渠道审核口径不同，不套用。
 */

export type MolaggPromptCategory = 'realHuman' | 'violence'

// 「写实」单用太宽（正常镜头描述也会写），只抓明确指向「真实的人」的写法；杀戮抓强信号词
const RULES: { category: MolaggPromptCategory; test: RegExp }[] = [
  { category: 'realHuman', test: /超写实|写实真人|真人|真实人物|真实人脸|真实肖像|photo[-\s]?realistic|hyper[-\s]?realistic|real (?:person|human|face)/i },
  { category: 'violence', test: /斩杀|砍杀|杀戮|杀敌|杀死|屠杀|血腥|血肉|断头|尸体|slaughter|behead|gore|bloody|killing/i },
]

/** 这个模型是不是走 Molagg（只有它需要预审） */
export function isMolaggVideoModel(model: { provider?: string | null } | null | undefined): boolean {
  return (model?.provider ?? '').toLowerCase() === 'molagg'
}

/** 扫一遍提示词，返回命中的雷区类别（空数组＝没踩雷） */
export function inspectMolaggPrompt(prompt: string | null | undefined): MolaggPromptCategory[] {
  const text = prompt ?? ''
  const hits: MolaggPromptCategory[] = []
  for (const rule of RULES) {
    if (rule.test.test(text)) hits.push(rule.category)
  }
  return hits
}
