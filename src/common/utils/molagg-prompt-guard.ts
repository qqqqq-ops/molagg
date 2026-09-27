/**
 * Molagg 提示词预审（后端）。
 *
 * 前端有一份同规则的（frontend molaggPromptGuard.ts），用在有用户在场的提交点，做「警告 + 可强行提交」。
 * 后端这份用在**没有用户在场、没法交互确认**的地方——目前是聊天的 AI 自动工作流：agent 自己拼提示词直接发。
 * 命中就早退拦掉（抛错，由上层 catch 记为该镜头失败），免得踩雷、白等约一小时才被 Molagg content_blocked。
 * 规则要和前端那份保持一致（真人写实 / 杀戮暴力）。
 */

export type MolaggPromptCategory = 'realHuman' | 'violence';

const RULES: { category: MolaggPromptCategory; test: RegExp }[] = [
  {
    category: 'realHuman',
    test: /超写实|写实真人|真人|真实人物|真实人脸|真实肖像|photo[-\s]?realistic|hyper[-\s]?realistic|real (?:person|human|face)/i,
  },
  { category: 'violence', test: /斩杀|砍杀|杀戮|杀敌|杀死|屠杀|血腥|血肉|断头|尸体|slaughter|behead|gore|bloody|killing/i },
];

/** 这个模型是不是走 Molagg（只有它需要预审） */
export function isMolaggVideoModel(model: { provider?: string | null } | null | undefined): boolean {
  return (model?.provider ?? '').toLowerCase() === 'molagg';
}

/** 扫一遍提示词，返回命中的雷区类别（空数组＝没踩雷） */
export function inspectMolaggPrompt(prompt: string | null | undefined): MolaggPromptCategory[] {
  const text = prompt ?? '';
  const hits: MolaggPromptCategory[] = [];
  for (const rule of RULES) {
    if (rule.test.test(text)) hits.push(rule.category);
  }
  return hits;
}
