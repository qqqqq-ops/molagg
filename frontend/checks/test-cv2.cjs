const m = require('./cv2.cjs')
let fails = 0
const check = (n, c, e='') => { if (c) console.log(`  ✓ ${n}`); else { fails++; console.log(`  ✗ ${n} ${e}`) } }

console.log('— 画布文件校验（四种报错分得开）—')
const good = JSON.stringify({ version: 1, app: 'molagg-canvas-v2', nodes: [], edges: [] })
check('合法文件通过', m.parseProjectFile(good).ok)
check('坏 JSON → invalidJson', m.parseProjectFile('{{{').code === 'invalidJson')
check('数组顶层 → invalidJson', m.parseProjectFile('[1,2]').code === 'invalidJson')
check('别家导出 → 不是本平台导出的画布文件',
  m.parseProjectFile(JSON.stringify({ version: 1, app: 'other', nodes: [], edges: [] })).code === 'foreignFile')
const future = m.parseProjectFile(JSON.stringify({ version: 99, app: 'molagg-canvas-v2', nodes: [], edges: [] }))
check('未来版本 → unsupportedVersion 且带上版本号', !future.ok && future.code === 'unsupportedVersion' && typeof future.version === 'number' && typeof future.max === 'number', JSON.stringify(future))
check('缺 nodes/edges → 对应报错',
  m.parseProjectFile(JSON.stringify({ version: 1, app: 'molagg-canvas-v2' })).code === 'missingGraph')
check('nodes 不是数组也报同一个错',
  m.parseProjectFile(JSON.stringify({ version: 1, app: 'molagg-canvas-v2', nodes: {}, edges: [] })).code === 'missingGraph')

console.log('\n— 提示词拼接 —')
const shot = m.buildShotPrompt([
  { list: m.LIGHT_POSITIONS, keys: ['key', 'rim'] },
  { list: m.LIGHT_COLORS, keys: ['golden'] },
])
check('多组片段按顺序拼接', shot === 'main key light from front-left, primary illumination, rim light from behind subject, edge separation, golden hour warm sunlight, 2800K', shot)
const dup = m.buildShotPrompt([{ list: m.LIGHT_POSITIONS, keys: ['key', 'key'] }])
check('重复的 key 只出现一次', dup.split('main key').length === 2)
// back 在「光位」是背景光、在「角度」是背面 —— 必须按组查，不能全局查表
const asLight = m.buildShotPrompt([{ list: m.LIGHT_POSITIONS, keys: ['back'] }])
const asAngle = m.buildShotPrompt([{ list: m.CHARACTER_ANGLES, keys: ['back'] }])
check('同名 key 按组区分：back 作光位 = background light', asLight.includes('background light'), asLight)
check('同名 key 按组区分：back 作角度 = back view', asAngle.includes('back view'), asAngle)
check('未知 key 被忽略，不产生 undefined', m.buildShotPrompt([{ list: m.SHOT_SIZES, keys: ['nope'] }]) === '')

console.log('\n— 素材库 —')
const composed = m.composeSnippetPrompt(m.BUILTIN_PROMPT_SNIPPETS, ['b-cinematic', 'b-negative'])
check('负面词不混进正向提示词', !composed.positive.includes('blurry'), composed.positive)
check('负面词单独取出', composed.negative.includes('blurry'))
check('正向词取到', composed.positive.includes('cinematic'))
check('不存在的 id 被忽略', m.composeSnippetPrompt(m.BUILTIN_PROMPT_SNIPPETS, ['nope']).positive === '')
check('内置素材 34 条', m.BUILTIN_PROMPT_SNIPPETS.length === 34, `实际 ${m.BUILTIN_PROMPT_SNIPPETS.length}`)
check('素材 id 不重复', new Set(m.BUILTIN_PROMPT_SNIPPETS.map(s=>s.id)).size === m.BUILTIN_PROMPT_SNIPPETS.length)

console.log('\n— 预设完整性 —')
for (const p of m.CANVAS_PRESETS) {
  const refs = new Set(p.nodes.map(n => n.ref))
  const bad = p.edges.filter(e => !refs.has(e.from) || !refs.has(e.to))
  check(`「${p.key}」连线指向的节点都存在`, bad.length === 0, JSON.stringify(bad))
  check(`「${p.key}」ref 不重复`, refs.size === p.nodes.length)
}
check('预设 key 不重复', new Set(m.CANVAS_PRESETS.map(p=>p.key)).size === m.CANVAS_PRESETS.length)
// 预设里引用的素材 id 必须真实存在，否则勾了个空
const snippetIds = new Set(m.BUILTIN_PROMPT_SNIPPETS.map(s=>s.id))
const badSnippet = m.CANVAS_PRESETS.flatMap(p => p.nodes.flatMap(n => (n.data?.snippetIds ?? []).filter(id => !snippetIds.has(id))))
check('预设引用的素材 id 都存在', badSnippet.length === 0, badSnippet.join(','))
// 预设里的角度 / 打光 key 也要存在
const angleKeys = new Set(m.CHARACTER_ANGLES.map(a=>a.key))
const badAngle = m.CANVAS_PRESETS.flatMap(p => p.nodes.flatMap(n => (n.data?.angleKeys ?? []).filter(k => !angleKeys.has(k))))
check('预设引用的角度 key 都存在', badAngle.length === 0, badAngle.join(','))

console.log('\n— store：增删连线撤销 —')
const S = m.useCanvasStore
const st = () => S.getState()
const a = st().addNode('text', { x: 0, y: 0 })
const b = st().addNode('imageGenerator', { x: 300, y: 0 })
check('新建两个节点', st().nodes.length === 2)
check('节点带 dragHandle（只有标题栏能拖）', st().nodes.every(n => n.dragHandle === '.cv2-drag-handle'))
st().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null })
check('连线成功', st().edges.length === 1)
st().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null })
check('同一对端口不会重复连', st().edges.length === 1)
st().onConnect({ source: a, target: a, sourceHandle: null, targetHandle: null })
check('不能自己连自己', st().edges.length === 1)
st().removeNodes([a])
check('删节点后悬空的线一起删掉', st().edges.length === 0 && st().nodes.length === 1)
st().undo()
check('撤销把节点和线都找回来', st().nodes.length === 2 && st().edges.length === 1)
st().redo()
check('重做再删掉', st().nodes.length === 1 && st().edges.length === 0)
st().undo()
st().updateNodeData(b, { prompt: 'hello' })
check('改节点内容生效', st().nodes.find(n=>n.id===b).data.prompt === 'hello')
const before = st().past.length
st().updateNodeData(b, { prompt: 'hello world' })
check('打字不记历史（撤销不会一个字一个字退）', st().past.length === before)

console.log('\n— 导出 / 合并导入 —')
const file = st().toProjectFile('测试')
check('导出带 app 标记和版本', file.app === 'molagg-canvas-v2' && file.version === 1)
check('导出能被自己的校验器接受', m.parseProjectFile(JSON.stringify(file)).ok)
const nodesBefore = st().nodes.length
st().loadProject(file, 'merge')
check('合并后节点翻倍', st().nodes.length === nodesBefore * 2, `${st().nodes.length} vs ${nodesBefore*2}`)
check('合并后 id 不撞车', new Set(st().nodes.map(n=>n.id)).size === st().nodes.length)
st().loadProject(file, 'replace')
check('替换模式只剩文件里的节点', st().nodes.length === nodesBefore)

console.log(fails === 0 ? '\n全部通过' : `\n${fails} 项失败`)
process.exit(fails === 0 ? 0 : 1)
