const m = require('./modes.cjs')
let fails = 0
const check = (n, c, e='') => { if (c) console.log(`  ✓ ${n}`); else { fails++; console.log(`  ✗ ${n} ${e}`) } }
// 用仓库里真实存在的模型名（后端启动日志里那批）
const M = (id, provider, key) => ({ id, provider, modelKey: key, isActive: true, capabilities: { remoteModel: key } })
const models = [
  M('1','wanx','wan2.7-t2v'), M('2','wanx','wan2.7-i2v'), M('3','wanx','wan2.7-r2v'),
  M('4','wanx','happyhorse-1.0-t2v'), M('5','wanx','happyhorse-1.0-i2v'), M('6','wanx','happyhorse-1.0-r2v'),
  M('7','wanx','wan3.0-t2v'), M('8','wanx','wan3.0-r2v'),
  M('9','doubao','doubao-seedance-2-5-260628'), M('10','doubao','doubao-seedance-2-0-260128'),
  M('11','kling','kling-v2-6'), M('12','sora','sora-2'), M('13','veo','veo-3.1'),
  M('14','hailuo','MiniMax-Hailuo-02'), M('15','vidu','viduq1'),
]
const kindOf = (k) => m.resolveVideoModelKind(k)

console.log('— 模型名 → kind —')
check('wan2.7-t2v → t2v', kindOf('wan2.7-t2v') === 't2v')
check('wan2.7-i2v → i2v', kindOf('wan2.7-i2v') === 'i2v')
check('wan2.7-r2v → r2v', kindOf('wan2.7-r2v') === 'r2v')
check('kling-v2-6 → null（名字里没有）', kindOf('kling-v2-6') === null)

console.log('\n— 模式归属（2026-09-24 按站长定义收紧）—')
// 首尾帧创作 = 首帧 + 尾帧框死开头结尾，只收真能吃首尾帧的模型；参考创作 = 参考素材 + 提示词
const modesOf = (id) => m.getModelModes(models.find(x=>x.id===id))
check('t2v 纯文字 → 不在创作页', modesOf('1').length === 0 && modesOf('4').length === 0 && modesOf('7').length === 0)
check('wan2.7-i2v 能收首尾帧 → 首尾帧创作', modesOf('2').join() === 'frames')
check('happyhorse-i2v 只收首帧 → 不在创作页', modesOf('5').length === 0)
check('r2v 只归参考', modesOf('3').join() === 'references')
check('happyhorse-r2v 只归参考', modesOf('6').join() === 'references')
check('wan3.0-r2v 只归参考', modesOf('8').join() === 'references')
check('Seedance 2.5 两种都支持', modesOf('9').sort().join() === 'frames,references')
check('Seedance 2.0 两种都支持', modesOf('10').sort().join() === 'frames,references')
for (const [id, name] of [['11','可灵'],['12','Sora'],['13','Veo'],['14','海螺'],['15','Vidu']]) {
  check(`${name} 只收首帧、没参考通道 → 不在创作页`, modesOf(id).length === 0)
}
const molagg = M('16','molagg','seedance-2-5-special')
check('Molagg Seedance 2.5（临时例外）→ 首尾帧创作，可以不带帧',
  m.getModelModes(molagg).join() === 'frames' && m.isFramesOptionalModel(molagg) === true)
check('别的模型都不是「可以不带帧」', !m.isFramesOptionalModel(models.find(x=>x.id==='9')) && !m.isFramesOptionalModel(null))

console.log('\n— 按模式过滤 —')
const frames = m.filterModelsByMode(models, 'frames').map(x=>x.id)
const refs = m.filterModelsByMode(models, 'references').map(x=>x.id)
check('首尾帧模式只剩 wan2.7-i2v + 两个 Seedance', frames.sort().join() === ['10','2','9'].sort().join(), `实际 ${frames}`)
check('参考模式的模型数', refs.length === 5, `实际 ${refs.length}: ${refs}`)
check('r2v 不出现在首尾帧模式', !frames.includes('3') && !frames.includes('6') && !frames.includes('8'))
check('可灵不出现在任何模式', !refs.includes('11') && !frames.includes('11'))
check('停用的模型被过滤掉',
  m.filterModelsByMode([{ ...M('x','doubao','doubao-seedance-2-5-260628'), isActive: false }], 'frames').length === 0)

console.log('\n— 尾帧支持 —')
const byId = (id) => models.find(x=>x.id===id)
check('wan2.7-i2v 支持尾帧', m.supportsLastFrame(byId('2')) === true)
check('happyhorse-i2v 不支持尾帧（只有首帧）', m.supportsLastFrame(byId('5')) === false)
check('Seedance 2.5 支持尾帧', m.supportsLastFrame(byId('9')) === true)
check('可灵不支持尾帧', m.supportsLastFrame(byId('11')) === false)
check('null 模型不报错', m.supportsLastFrame(null) === false)

console.log('\n— 参考素材类型 —')
check('万相 wan2.7 参考模式收视频和音频', JSON.stringify(m.supportsReferenceMedia(byId('3'))) === '{"video":true,"audio":true}')
check('happyhorse 不收参考视频', m.supportsReferenceMedia(byId('6')).video === false)
check('豆包收视频和音频', m.supportsReferenceMedia(byId('9')).video === true)

console.log('\n— 切模式时挑模型 —')
check('当前模型支持新模式 → 保持不变', m.pickModelForMode(models, 'frames', '2') === '2')
check('当前模型不支持 → 换成该模式第一个', m.pickModelForMode(models, 'references', '2') === '3')
check('一个都没有 → 空字符串', m.pickModelForMode([], 'frames', '2') === '')

console.log(fails === 0 ? '\n全部通过' : `\n${fails} 项失败`)
process.exit(fails === 0 ? 0 : 1)
