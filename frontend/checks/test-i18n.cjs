/**
 * 画布 i18n 一致性检查。
 * 光看页面看不出「这句话漏翻了」——useTranslations 查不到 key 时返回的是 key 本身，
 * 界面上会出现 "canvas.node.xxx" 这种字符串，跑起来不报错。所以在这里静态查。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CV2 = path.join(ROOT, 'src/components/features/canvas-v2')
const zh = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/locales/zh-CN/canvas.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/locales/en-US/canvas.json'), 'utf8'))
const data = require('./cv2.cjs')

let fails = 0
const check = (n, c, e = '') => { if (c) console.log('  ✓ ' + n); else { fails++; console.log('  ✗ ' + n + ' ' + e) } }

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, prefix + k + '.') : [prefix + k])
}
const zhKeys = new Set(flatten(zh))
const enKeys = new Set(flatten(en))

console.log('— 两份文案表对齐 —')
const missEn = [...zhKeys].filter(k => !enKeys.has(k))
const missZh = [...enKeys].filter(k => !zhKeys.has(k))
check('en 不缺 key', missEn.length === 0, missEn.join(', '))
check('zh 不缺 key', missZh.length === 0, missZh.join(', '))
check('两边都不是空字符串',
  [...zhKeys].every(k => String(get(zh, k)).trim() && String(get(en, k)).trim()))

function get(o, k) { return k.split('.').reduce((a, s) => (a == null ? a : a[s]), o) }

console.log('\n— 占位符两边一致 —')
// {count} 这类占位符两边必须同名同数，否则一种语言里数字会凭空消失
const ph = s => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',')
const phBad = [...zhKeys].filter(k => ph(get(zh, k)) !== ph(get(en, k)))
check('占位符一一对应', phBad.length === 0, phBad.join(', '))

console.log('\n— 代码里用到的 key 都有文案 —')
// 收集 canvas-v2 全部源码
const files = []
;(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(f)) files.push(p)
  }
})(CV2)
const src = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')

// 1) 写死的 key：t('a.b.c')
const used = new Set()
for (const m of src.matchAll(/\bt\('([^']+)'/g)) used.add(m[1])

// 2) 模板 key：t(`a.${x}.b`) —— 按真实数据展开
const templates = [...src.matchAll(/\bt\(`([^`]+)`/g)].map(m => m[1])
const KINDS = ['text','markdown','stickyNote','image','video','audio','imageGenerator','videoGenerator',
  'audioGenerator','promptGroup','director','script','videoStitch','group']
const GROUPS = ['generator','media','text','structure']
const SHOT_GROUPS = {
  angles: data.CHARACTER_ANGLES, lightPositions: data.LIGHT_POSITIONS, lightColors: data.LIGHT_COLORS,
  lightBrightness: data.LIGHT_BRIGHTNESS, shotSizes: data.SHOT_SIZES, cameraHeights: data.CAMERA_HEIGHTS,
}
const expand = {
  'nodeKinds.${kind}': KINDS.map(k => `nodeKinds.${k}`),
  'groups.${group.key}': GROUPS.map(k => `groups.${k}`),
  'shot.${group}.${option.key}': Object.entries(SHOT_GROUPS)
    .flatMap(([g, list]) => list.map(o => `shot.${g}.${o.key}`)),
  'shot.lightingPresets.${preset.key}.label': data.LIGHTING_PRESETS.map(p => `shot.lightingPresets.${p.key}.label`),
  'shot.lightingPresets.${preset.key}.description':
    data.LIGHTING_PRESETS.map(p => `shot.lightingPresets.${p.key}.description`),
  'snippets.categories.${category}': [...new Set(data.BUILTIN_PROMPT_SNIPPETS.map(s => s.category))]
    .map(c => `snippets.categories.${c}`),
  'snippets.items.${snippet.id}': data.BUILTIN_PROMPT_SNIPPETS.map(s => `snippets.items.${s.id}`),
  'snippets.items.${s.id}': data.BUILTIN_PROMPT_SNIPPETS.map(s => `snippets.items.${s.id}`),
  'presets.${preset.key}.name': data.CANVAS_PRESETS.map(p => `presets.${p.key}.name`),
  'presets.${preset.key}.description': data.CANVAS_PRESETS.map(p => `presets.${p.key}.description`),
  'presets.${preset.key}.nodes.${node.ref}':
    data.CANVAS_PRESETS.flatMap(p => p.nodes.map(n => `presets.${p.key}.nodes.${n.ref}`)),
  'presets.${preset.key}.prompts.${node.ref}':
    data.CANVAS_PRESETS.flatMap(p => p.nodes.filter(n => n.seedPrompt).map(n => `presets.${p.key}.prompts.${n.ref}`)),
  'errors.file.${result.code}': ['invalidJson','foreignFile','unsupportedVersion','missingGraph']
    .map(c => `errors.file.${c}`),
  'node.generator.outputNote.${config.noteKey}': ['midjourney','video']
    .map(c => `node.generator.outputNote.${c}`),
  'upstream.${part.kind}': ['images','videos','audios','texts','snippets'].map(k => `upstream.${k}`),
  'sidebar.tabs.${tab}': ['build','assistant','library','versions'].map(k => `sidebar.tabs.${k}`),
  // 节点详情里展示的字段，直接从 AssistantPanel 的 SHOWN_FIELDS 读，免得两边走偏
  'assistant.field.${row.field}': (() => {
    const tsx = fs.readFileSync(path.join(CV2, 'assistant/AssistantPanel.tsx'), 'utf8')
    const block = tsx.match(/const SHOWN_FIELDS = \[([\s\S]*?)\] as const/)[1]
    return [...block.matchAll(/'([^']+)'/g)].map(m => `assistant.field.${m[1]}`)
  })(),
}
// t(`nodeKinds.${node.type ?? 'text'}`) 跟 nodeKinds.${kind} 是同一批 key
expand["nodeKinds.${node.type ?? 'text'}"] = expand['nodeKinds.${kind}']
expand["nodeKinds.${hit.node.type ?? 'text'}"] = expand['nodeKinds.${kind}']
// 素材兼容报错里的「参考图 / 参考视频 / 参考音频」：kind 来自 materialCheck 传给 findAssetIssue 的三种
expand['materialKind.${issue.kind}'] = ['image', 'video', 'audio'].map(k => `materialKind.${k}`)
const unknownTpl = [...new Set(templates)].filter(t => !(t in expand))
check('没有测试没覆盖到的模板 key', unknownTpl.length === 0, unknownTpl.join(' | '))
for (const t of new Set(templates)) for (const k of expand[t] || []) used.add(k)

const missing = [...used].filter(k => !zhKeys.has(k))
check(`代码用到的 ${used.size} 个 key 全都有中文`, missing.length === 0, missing.join(', '))
check('全都有英文', [...used].every(k => enKeys.has(k)))

console.log('\n— 文案表里没有没人用的 key —')
// custom 分类现在没有内置条目（留给用户收藏），允许暂时闲置
const ALLOW_UNUSED = new Set(['snippets.categories.custom'])
const orphan = [...zhKeys].filter(k => !used.has(k) && !ALLOW_UNUSED.has(k))
check('没有孤儿 key', orphan.length === 0, orphan.join(', '))

console.log('\n— 源码里没有写死的中文 —')
const leftovers = []
for (const f of files) {
  let block = false
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const s = line.trim()
    if (block) { if (s.includes('*/')) block = false; return }
    if (s.startsWith('/*')) { if (!s.includes('*/')) block = true; return }
    if (s.startsWith('//') || s.startsWith('*')) return
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
    if (/[一-鿿]/.test(code)) leftovers.push(`${path.basename(f)}:${i + 1}`)
  })
}
check('组件/数据里没有中文字面量', leftovers.length === 0, leftovers.join(', '))

console.log('\n— 发给模型的提示词永远是英文 —')
// promptFragment / content 是请求内容，不跟界面语言走
const allFragments = [
  ...Object.values(SHOT_GROUPS).flat().map(o => o.promptFragment),
  ...data.BUILTIN_PROMPT_SNIPPETS.map(s => s.content),
]
check(`${allFragments.length} 段提示词片段都没有中文`,
  allFragments.every(f => f && !/[一-鿿]/.test(f)))
check('内置素材不带 name（名字走 i18n）', data.BUILTIN_PROMPT_SNIPPETS.every(s => s.name === undefined))
check('预设不带写死的名字/说明',
  data.CANVAS_PRESETS.every(p => p.name === undefined && p.description === undefined))
check('预设节点不带写死的标题/提示词',
  data.CANVAS_PRESETS.every(p => p.nodes.every(n => !n.data || (n.data.title === undefined && n.data.prompt === undefined))))

console.log(fails ? `\n${fails} 条不通过` : '\n全部通过')
process.exit(fails ? 1 : 0)
