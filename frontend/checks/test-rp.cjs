/**
 * 站长两个中转站的价格说明：只在渠道地址指向这两个站时出价，别家地址一律不出。
 */
const r = require('./rp.cjs')
let fails = 0
const check = (n, c, e = '') => { if (c) console.log('  ✓ ' + n); else { fails++; console.log('  ✗ ' + n + ' ' + e) } }
const J = (v) => JSON.stringify(v)

console.log('— 哪些地址算站长的站 —')
check('opusapi.xyz 本身', r.isHostOf('https://opusapi.xyz', 'opusapi.xyz'))
check('子域名 api.opusapi.xyz 也算', r.isHostOf('https://api.opusapi.xyz/v1', 'opusapi.xyz'))
check('名字里带但不是它的子域名不算（evilopusapi.xyz）', !r.isHostOf('https://evilopusapi.xyz', 'opusapi.xyz'))
check('路径里带不算', !r.isHostOf('https://other.com/opusapi.xyz', 'opusapi.xyz'))
check('空地址 / 乱写的地址不算', !r.isHostOf('', 'opusapi.xyz') && !r.isHostOf('not a url', 'opusapi.xyz'))

console.log('\n— 出不出价 —')
const img = r.relayPriceFor({ provider: 'gptimage' }, 'https://api.opusapi.xyz')
check('GPT Image + opusapi → 生图价 0.4 / 高画质 0.8', img && img.kind === 'image' && img.standard === 0.4 && img.high === 0.8, J(img))
const vid = r.relayPriceFor({ provider: 'molagg' }, 'https://molagg.com')
check('Molagg 视频 + molagg.com → 30 秒 ¥6', vid && vid.kind === 'video' && vid.perClip === 6 && vid.seconds === 30, J(vid))
check('api.molagg.com 也算', r.relayPriceFor({ provider: 'molagg' }, 'https://api.molagg.com') !== null)
check('GPT Image 填了别家地址 → 不出价', r.relayPriceFor({ provider: 'gptimage' }, 'https://api.openai.com') === null)
check('别的模型走 opusapi 地址 → 不出价（价格只对 GPT Image 2）', r.relayPriceFor({ provider: 'nanobanana' }, 'https://opusapi.xyz') === null)
check('没模型 → 不出价', r.relayPriceFor(null, 'https://opusapi.xyz') === null)

console.log('\n— 合计与显示 —')
check('4 张图 = ¥1.6', r.estimateRelayCost(img, 4) === 1.6)
check('2 条视频 = ¥12', r.estimateRelayCost(vid, 2) === 12)
check('0.1+0.2 这类不出现一长串小数', r.estimateRelayCost({ kind: 'image', standard: 0.1, high: 0 }, 3) === 0.3)
check('显示去掉多余的 0：¥6、¥0.4、¥0.75', r.formatYuan(6) === '¥6' && r.formatYuan(0.4) === '¥0.4' && r.formatYuan(0.75) === '¥0.75')

console.log(fails === 0 ? '\n全部通过' : '\n' + fails + ' 项失败')
process.exit(fails === 0 ? 0 : 1)
