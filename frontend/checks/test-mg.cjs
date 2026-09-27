/**
 * Molagg 提示词预审：踩雷（真人写实 / 杀戮暴力）要扫得出、正常镜头描述不误报、只对 Molagg 生效。
 * 注意：这是提交前的「警告」不是硬拦，规则是照 Molagg 黑箱审核反推的，命中口径可随实测调整。
 */
const g = require('./mg.cjs')
let fails = 0
const check = (n, c, e = '') => { if (c) console.log('  ✓ ' + n); else { fails++; console.log('  ✗ ' + n + ' ' + e) } }
const J = (v) => JSON.stringify(v)

console.log('— 只对 Molagg 生效 —')
check('provider molagg 要预审', g.isMolaggVideoModel({ provider: 'molagg' }))
check('大小写不敏感', g.isMolaggVideoModel({ provider: 'Molagg' }))
check('豆包不预审', !g.isMolaggVideoModel({ provider: 'doubao' }))
check('空模型不预审', !g.isMolaggVideoModel(null) && !g.isMolaggVideoModel(undefined))

console.log('\n— 真人写实 —')
check('超写实真人', g.inspectMolaggPrompt('超写实真人电影质感').includes('realHuman'))
check('真人', g.inspectMolaggPrompt('真人出镜').includes('realHuman'))
check('photorealistic', g.inspectMolaggPrompt('photorealistic portrait').includes('realHuman'))
check('hyper-realistic', g.inspectMolaggPrompt('hyper realistic human').includes('realHuman'))

console.log('\n— 杀戮暴力 —')
check('斩杀敌方士兵', g.inspectMolaggPrompt('连续挥剑斩杀敌方士兵').includes('violence'))
check('血腥', g.inspectMolaggPrompt('血腥场面').includes('violence'))
check('killing', g.inspectMolaggPrompt('killing spree').includes('violence'))

console.log('\n— #11 真实案例：两类都命中 —')
check('#11 提示词命中 realHuman + violence', J(g.inspectMolaggPrompt('超写实真人电影质感，连续挥剑斩杀敌方士兵')) === J(['realHuman', 'violence']))

console.log('\n— 不误报 —')
check('#12 改写后（电影级写实风格/交锋过招）不命中', g.inspectMolaggPrompt('电影级写实风格，影视质感，白衣女侠与对手交锋、格挡、挥剑过招').length === 0)
check('普通风景不命中', g.inspectMolaggPrompt('清晨湖面，纸船缓缓漂流，阳光洒在水面').length === 0)
check('空提示词不命中', g.inspectMolaggPrompt('').length === 0 && g.inspectMolaggPrompt(null).length === 0)

console.log(fails ? `\n${fails} 处不通过` : '\n全部通过')
process.exit(fails ? 1 : 0)
