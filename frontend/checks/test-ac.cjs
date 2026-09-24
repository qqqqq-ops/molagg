const { findAssetIssue, describeAssetIssue } = require('./ac.cjs')
let fails=0; const check=(n,c,e='')=>{ if(c) console.log('  ✓ '+n); else { fails++; console.log('  ✗ '+n+' '+e) } }
const C = (kind,count,supported,max) => ({kind,count,supported,max})

console.log('— 什么都不传就没问题 —')
check('全是 0 个 → 没问题', findAssetIssue([C('image',0,false),C('video',0,false)]) === null)
check('支持且没超 → 没问题', findAssetIssue([C('image',3,true,5)]) === null)
check('正好到上限 → 没问题', findAssetIssue([C('image',5,true,5)]) === null)
check('max 不填 = 不限', findAssetIssue([C('image',99,true)]) === null)
check('max=0 也当不限', findAssetIssue([C('image',99,true,0)]) === null)

console.log('\n— 不支持 —')
const u = findAssetIssue([C('image',10,false)])
check('传了 10 张但模型不支持 → unsupported', u && u.reason==='unsupported' && u.kind==='image', JSON.stringify(u))
check('模型不支持但一个都没传 → 放行', findAssetIssue([C('audio',0,false)]) === null)

console.log('\n— 超数量 —')
const o = findAssetIssue([C('image',7,true,3)])
check('7 张但最多 3 张 → overLimit 带上数字', o && o.reason==='overLimit' && o.max===3 && o.count===7, JSON.stringify(o))

console.log('\n— 两种问题同时存在时，先报「不支持」 —')
// 不支持视频 + 图片超限：应该先说视频不支持，而不是「图最多 3 张」
const mixed = findAssetIssue([C('image',7,true,3), C('video',1,false)])
check('先报不支持的那个', mixed.reason==='unsupported' && mixed.kind==='video', JSON.stringify(mixed))
// 不支持的那类如果数量是 0，就不该抢在超限前面
const mixed2 = findAssetIssue([C('image',7,true,3), C('video',0,false)])
check('不支持但没传的不抢先', mixed2.reason==='overLimit' && mixed2.kind==='image', JSON.stringify(mixed2))

console.log('\n— 文案 key —')
const d1 = describeAssetIssue({reason:'unsupported',kind:'frame'})
check('unsupported → assetUnsupported + frame 的 kindKey',
  d1.key==='errors.assetUnsupported' && d1.kindKey==='form.assetKind.frame', JSON.stringify(d1))
const d2 = describeAssetIssue({reason:'overLimit',kind:'audio',max:2,count:5})
check('overLimit 带上 max/count', d2.key==='errors.assetOverLimit' && d2.params.max===2 && d2.params.count===5, JSON.stringify(d2))

console.log(fails===0?'\n全部通过':'\n'+fails+' 项失败')
process.exit(fails===0?0:1)
