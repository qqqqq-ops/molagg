/**
 * 画布整图操作的离线自测：级联排批次、连线方向纠正、整理画布、成组 / 解组 / 折叠、
 * 对齐参考线、素材兼容与换模型建议、斜杠命令、分组当上游。
 * 全是纯函数，不需要浏览器、不需要真实渠道。
 */
const g = require('./go.cjs')
let fails = 0
const check = (n, c, e = '') => { if (c) console.log('  ✓ ' + n); else { fails++; console.log('  ✗ ' + n + ' ' + e) } }
const N = (id, type, x = 0, y = 0, data = {}, extra = {}) =>
  ({ id, type, position: { x, y }, data, measured: { width: 200, height: 100 }, ...extra })
const E = (source, target) => ({ id: `${source}->${target}`, source, target })
const J = (v) => JSON.stringify(v)

console.log('— 级联排批次 —')
{
  // 文字 → 图生成器A → 结果图 → 视频生成器B；另有一个独立的图生成器C
  const nodes = [N('t', 'text'), N('A', 'imageGenerator'), N('r', 'image', 0, 0, { sourceNodeId: 'A' }),
    N('B', 'videoGenerator'), N('C', 'imageGenerator')]
  const plan = g.planCascade(nodes, [E('t', 'A'), E('A', 'r'), E('r', 'B')])
  check('A、C 第一批，B 第二批（隔着结果图也算依赖）',
    plan.ok && J(plan.batches.map((b) => b.sort())) === J([['A', 'C'], ['B']]), J(plan))
  // A 直接连 B
  const direct = g.planCascade([N('A', 'imageGenerator'), N('B', 'imageGenerator')], [E('A', 'B')])
  check('生成器直连生成器 → 两批', direct.ok && direct.batches.length === 2)
  check('空画布 → empty', J(g.planCascade([], [])) === J({ ok: false, reason: 'empty' }))
  check('只有文字没有生成器 → empty', g.planCascade([N('t', 'text')], []).reason === 'empty')
  check('音频生成器不算（没渠道）', g.planCascade([N('a', 'audioGenerator')], []).reason === 'empty')
  const loop = g.planCascade([N('A', 'imageGenerator'), N('r', 'image')], [E('A', 'r'), E('r', 'A')])
  check('结果图又连回自己的生成器 → cyclic', loop.ok === false && loop.reason === 'cyclic')
  // 分组连出去：组里有生成器A，组 → B，B 要排在 A 后面
  const grouped = g.planCascade(
    [N('G', 'group'), N('A', 'imageGenerator', 0, 0, {}, { parentId: 'G' }), N('B', 'imageGenerator')],
    [E('G', 'B')])
  check('从分组连出去 = 组里每个节点都连过去', grouped.ok && J(grouped.batches) === J([['A'], ['B']]), J(grouped))
}

console.log('\n— 连线方向纠正 —')
{
  const nodes = [N('gen', 'imageGenerator'), N('txt', 'text'), N('up', 'image'),
    N('res', 'image', 0, 0, { sourceNodeId: 'gen' }), N('gen2', 'videoGenerator')]
  const c = (source, target) => ({ source, target, sourceHandle: 'a', targetHandle: 'b' })
  const f1 = g.orientConnection(c('gen', 'txt'), nodes)
  check('生成器 → 文字：反过来', f1.flipped && f1.connection.source === 'txt' && f1.connection.target === 'gen')
  check('反过来时两端的 handle 也对调', f1.connection.sourceHandle === 'b' && f1.connection.targetHandle === 'a')
  check('生成器 → 用户自己传的图：反过来', g.orientConnection(c('gen', 'up'), nodes).flipped)
  check('生成器 → 它自己的结果图：正常方向不动', !g.orientConnection(c('gen', 'res'), nodes).flipped)
  check('生成器 → 生成器：不动（上游产出喂下游）', !g.orientConnection(c('gen', 'gen2'), nodes).flipped)
  check('文字 → 生成器：本来就对，不动', !g.orientConnection(c('txt', 'gen'), nodes).flipped)
}

console.log('\n— 整理画布 —')
{
  const nodes = [N('b', 'imageGenerator', 500, 500), N('a', 'text', 900, 50), N('c', 'image', 10, 900)]
  const out = g.tidyLayout(nodes, [E('a', 'b'), E('b', 'c')])
  const pos = Object.fromEntries(out.map((n) => [n.id, n.position]))
  check('上游在左、下游在右', pos.a.x < pos.b.x && pos.b.x < pos.c.x, J(pos))
  check('从原来最左上角开始排', pos.a.x === 10 && pos.a.y === 50, J(pos.a))
  const child = N('k', 'text', 5, 5, {}, { parentId: 'G' })
  const withGroup = g.tidyLayout([N('G', 'group', 300, 300), child], [])
  check('组里的节点坐标不动（跟着组走）', withGroup[1] === child)
  check('空画布原样返回', g.tidyLayout([], []).length === 0)
  const loop = g.tidyLayout([N('x', 'text'), N('y', 'text')], [E('x', 'y'), E('y', 'x')])
  check('有环也不会死循环', loop.length === 2)
}

console.log('\n— 成组 / 解组 / 折叠 —')
{
  const nodes = [N('a', 'image', 100, 100), N('b', 'image', 400, 100), N('c', 'text', 1000, 1000)]
  const r = g.groupNodes(nodes, ['a', 'b'], 'G')
  check('成组成功', r.ok && r.count === 2)
  const ids = r.nodes.map((n) => n.id)
  check('组排在组员前面（React Flow 要求）', ids.indexOf('G') < ids.indexOf('a') && ids.indexOf('G') < ids.indexOf('b'), J(ids))
  const G = r.nodes.find((n) => n.id === 'G'); const a = r.nodes.find((n) => n.id === 'a')
  check('组员坐标换成相对组', a.parentId === 'G' && G.position.x + a.position.x === 100 && G.position.y + a.position.y === 100)
  check('组把组员整个包住', G.width >= 500 && G.height >= 100)
  check('全是图片 → 素材组', r.mediaOnly === true)
  check('只选 1 个 → needTwo', g.groupNodes(nodes, ['a'], 'X').reason === 'needTwo')
  check('选了组里的节点 → noNesting', g.groupNodes(r.nodes, ['a', 'c'], 'X').reason === 'noNesting')
  check('选了组本身 → noNesting', g.groupNodes(r.nodes, ['G', 'c'], 'X').reason === 'noNesting')

  check('选中组员按解组 = 解它所在的组', J(g.groupsToUngroup(r.nodes, ['a'])) === J(['G']))
  const edges = [E('G', 'gen')]
  const u = g.ungroupNodes(r.nodes, edges, ['G'])
  const ua = u.nodes.find((n) => n.id === 'a')
  check('解组后组没了、组员回到原来的画布坐标', !u.nodes.some((n) => n.id === 'G') && ua.position.x === 100 && ua.position.y === 100 && !ua.parentId)
  check('从组连出去的线摊到每个组员身上', J(u.edges.map((e) => e.source).sort()) === J(['a', 'b']) && u.edges.every((e) => e.target === 'gen'))

  const folded = g.setGroupCollapsed(r.nodes, 'G', true)
  const fG = folded.find((n) => n.id === 'G')
  check('折叠：组缩成组头、组员藏起来', fG.height === g.GROUP_HEADER && folded.filter((n) => n.parentId === 'G').every((n) => n.hidden))
  const opened = g.setGroupCollapsed(folded, 'G', false)
  check('展开：恢复原来高度、组员露出来', opened.find((n) => n.id === 'G').height === G.height && opened.filter((n) => n.parentId === 'G').every((n) => !n.hidden))
  const all = g.toggleAllGroups(r.nodes)
  check('全部折叠/展开：有展开的就全折叠', all.collapsed === true && all.count === 1)

  let seq = 0
  const auto = g.autoGroup([N('x', 'text'), N('y', 'imageGenerator'), N('z', 'image'), N('lone', 'text')],
    [E('x', 'y')], () => `AG${++seq}`)
  check('按功能成组：连在一起的包一组，单独的不动', auto.count === 1 && auto.nodes.find((n) => n.id === 'lone').parentId === undefined
    && auto.nodes.find((n) => n.id === 'x').parentId === 'AG1')
}

console.log('\n— 分组当上游 —')
{
  const nodes = [N('G', 'group'), N('i1', 'image', 0, 0, { url: 'u1' }, { parentId: 'G' }),
    N('i2', 'image', 0, 0, { url: 'u2' }, { parentId: 'G' }), N('gen', 'imageGenerator')]
  const inputs = g.collectUpstreamInputs('gen', nodes, [E('G', 'gen')])
  check('从组拉一根线进来 = 组里两张图都是参考图', J(inputs.imageUrls) === J(['u1', 'u2']), J(inputs))
}

console.log('\n— 对齐参考线 —')
{
  const others = [{ x: 0, y: 0, width: 200, height: 100 }]
  const a = g.computeAlignment({ x: 204, y: 300, width: 100, height: 50 }, others, 6)
  check('左边贴近别人的右边 → 吸过去', a.x === 200 && a.vertical === 200, J(a))
  check('另一个方向离得远 → 不动、不画线', a.y === 300 && a.horizontal === null)
  const b = g.computeAlignment({ x: 500, y: 500, width: 10, height: 10 }, others, 6)
  check('都离得远 → 原样', b.x === 500 && b.y === 500 && b.vertical === null)
}

console.log('\n— 素材兼容 & 换模型建议（只建议，不自动换）—')
{
  const M = (id, supports = {}, limits = {}, extra = {}) =>
    ({ id, name: id, isActive: true, sortOrder: 0, supportsImageInput: null, capabilities: { supports, limits }, ...extra })
  const textOnly = M('text-only')
  const imgMax2 = M('img2', { imageInput: true }, { maxInputImages: 2 })
  const imgAny = M('imgAny', { imageToImage: true })
  check('没连素材 → 没问题', g.findMaterialIssue(textOnly, { images: 0, videos: 0, audios: 0 }) === null)
  const u = g.findMaterialIssue(textOnly, { images: 10, videos: 0, audios: 0 })
  check('十张图连到只收文字的模型 → 不支持', u && u.reason === 'unsupported' && u.kind === 'image', J(u))
  const o = g.findMaterialIssue(imgMax2, { images: 3, videos: 0, audios: 0 })
  check('3 张图、最多 2 张 → 超数量', o && o.reason === 'overLimit' && o.max === 2)
  check('imageToImage 也算收参考图', g.findMaterialIssue(imgAny, { images: 5, videos: 0, audios: 0 }) === null)
  check('视频没声明 videoInput → 不支持', g.findMaterialIssue(imgAny, { images: 0, videos: 1, audios: 0 })?.kind === 'video')
  const s = g.suggestModel([textOnly, imgMax2, imgAny], { images: 3, videos: 0, audios: 0 }, 'text-only')
  check('建议第一个收得下的模型', s && s.id === 'imgAny', J(s && s.id))
  check('不建议当前这个', g.suggestModel([imgAny], { images: 1, videos: 0, audios: 0 }, 'imgAny') === null)
  check('停用的模型不建议', g.suggestModel([{ ...imgAny, isActive: false }], { images: 1, videos: 0, audios: 0 }, null) === null)
}

console.log('\n— 斜杠命令 —')
{
  check('/li → light', J(g.matchSlashCommands('/li').map((c) => c.key)) === J(['light']))
  check('/ → 两个都列出来', g.matchSlashCommands('/').length === 2)
  check('不带 / 不算命令', g.matchSlashCommands('light').length === 0)
  const light = g.slashGeneratorData('light')
  check('/light 选中图：三点布光填好', light.lightingPresetKey === 'three-point' && light.lightPositionKeys.length === 3)
  check('/angle 选中图：4 个视角', g.slashGeneratorData('angle').angleKeys.length === 4 && g.slashGeneratorCount('angle') === 4)
  check('文字节点里的提示词是英文（发给模型的）',
    ['light', 'angle'].every((k) => g.slashTextPrompt(k).length > 20 && !/[一-鿿]/.test(g.slashTextPrompt(k))))
}

console.log('\n— 存盘 / 快照对比 / 模板 —')
{
  const nodes = [N('a', 'text', 0, 0, { text: 'hi' }, { selected: true, dragging: true }),
    N('g', 'imageGenerator', 300, 0, { prompt: 'p', status: 'processing', taskId: 't1', progress: 40 })]
  const clean = g.cleanGraph(nodes, [{ ...E('a', 'g'), selected: true }])
  check('存盘去掉选中 / 拖动', !('selected' in clean.nodes[0]) && !('dragging' in clean.nodes[0]) && !('selected' in clean.edges[0]))
  check('存盘不改原数组', nodes[0].selected === true)
  const settled = g.settleStaleRuns(clean.nodes)
  check('读回来时还在转圈的放回空闲', settled.count === 1 && settled.nodes[1].data.status === 'idle' && settled.nodes[1].data.taskId === 't1')

  const before = { nodes: [N('a', 'text', 0, 0, { text: 'hi' }), N('b', 'text', 0, 0, { text: 'x' }),
    N('c', 'imageGenerator', 0, 0, { prompt: 'p', status: 'idle' })], edges: [E('a', 'c')] }
  const after = { nodes: [N('a', 'text', 50, 0, { text: 'hi' }), N('c', 'imageGenerator', 0, 0, { prompt: 'p2', status: 'completed' }),
    N('d', 'image')], edges: [E('d', 'c')] }
  const d = g.diffGraphs(before, after)
  check('对比：多了 d、少了 b', d.added.map((n) => n.id).join() === 'd' && d.removed.map((n) => n.id).join() === 'b')
  check('对比：改了提示词算「改了」', d.changed.map((n) => n.id).join() === 'c')
  check('对比：只挪位置算「挪了」', d.moved === 1)
  check('对比：连线 +1 −1', d.edgesAdded === 1 && d.edgesRemoved === 1)
  const runOnly = g.diffGraphs(before, { ...before, nodes: before.nodes.map((n) => n.id === 'c' ? { ...n, data: { ...n.data, status: 'failed' } } : n) })
  check('只是运行状态变了 → 不算变化', g.isSameGraph(runOnly))
  check('一模一样 → 没变化', g.isSameGraph(g.diffGraphs(before, before)))

  const grouped = [N('G', 'group', 100, 100), N('k1', 'image', 10, 40, { url: 'u' }, { parentId: 'G' }),
    N('k2', 'text', 200, 40, {}, { parentId: 'G' }), N('gen', 'imageGenerator', 600, 0, { prompt: 'p', status: 'completed', taskId: 'z' }),
    N('out', 'text', 900, 900)]
  const sel = g.extractSelection(grouped, [E('G', 'gen'), E('gen', 'out')], ['G', 'gen'])
  check('选了组 → 组员一起带上，没选的不带', sel.nodes.map((n) => n.id).sort().join() === 'G,gen,k1,k2')
  check('只留两端都在里面的连线', sel.edges.length === 1 && sel.edges[0].target === 'gen')
  check('模板里生成器的运行状态清掉', sel.nodes.find((n) => n.id === 'gen').data.status === 'idle' && sel.nodes.find((n) => n.id === 'gen').data.taskId === null)
  const lone = g.extractSelection(grouped, [], ['k1'])
  check('只选组里一个节点 → 换回画布坐标、不带 parentId', !lone.nodes[0].parentId && lone.nodes[0].position.x === 110 && lone.nodes[0].position.y === 140)

  let n = 0
  const placed = g.instantiateGraph(sel, { x: 1000, y: 2000 }, (kind) => `${kind}-new${++n}`)
  const ids = placed.nodes.map((x) => x.id)
  check('铺开时全部换新 id', !ids.some((id) => ['G', 'gen', 'k1', 'k2'].includes(id)))
  const newG = placed.nodes.find((x) => x.type === 'group')
  check('组员的 parentId 跟着换', placed.nodes.filter((x) => x.type !== 'group' && x.parentId).every((x) => x.parentId === newG.id))
  check('组排在组员前面', ids.indexOf(newG.id) < Math.min(...placed.nodes.filter((x) => x.parentId).map((x) => ids.indexOf(x.id))))
  check('顶层左上角对齐到放置点', Math.min(...placed.nodes.filter((x) => !x.parentId).map((x) => x.position.x)) === 1000
    && Math.min(...placed.nodes.filter((x) => !x.parentId).map((x) => x.position.y)) === 2000)
  check('组员相对坐标不动', placed.nodes.find((x) => x.type === 'image').position.x === 10)
  check('连线两端换成新 id', placed.edges[0].source === newG.id && ids.includes(placed.edges[0].target))
}

console.log(fails === 0 ? '\n全部通过' : '\n' + fails + ' 项失败')
process.exit(fails === 0 ? 0 : 1)
