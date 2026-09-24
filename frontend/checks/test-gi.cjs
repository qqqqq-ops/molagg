const { collectUpstreamInputs, summarizeInputs } = require('./gi.cjs')
let fails=0; const check=(n,c,e='')=>{ if(c) console.log('  ✓ '+n); else { fails++; console.log('  ✗ '+n+' '+e) } }
const N=(id,type,data={})=>({id,type,position:{x:0,y:0},data})
const E=(from,to)=>({id:`${from}-${to}`,source:from,target:to})

console.log('— 基本收集 —')
let nodes=[N('t1','text',{text:'一只猫'}), N('g','imageGenerator')]
let edges=[E('t1','g')]
let r=collectUpstreamInputs('g',nodes,edges)
check('文字节点进 texts', r.texts.join()==='一只猫', JSON.stringify(r.texts))

nodes=[N('i1','image',{url:'http://a/1.png'}), N('g','videoGenerator')]
edges=[E('i1','g')]
r=collectUpstreamInputs('g',nodes,edges)
check('图片节点进 imageUrls', r.imageUrls.join()==='http://a/1.png')

nodes=[N('p','promptGroup',{snippetIds:['b-cinematic','b-4k-hdr']}), N('g','imageGenerator')]
r=collectUpstreamInputs('g',nodes,[E('p','g')])
check('提示词组进 snippetIds', r.snippetIds.join()==='b-cinematic,b-4k-hdr')

nodes=[N('d','director',{theme:'雪夜',outline:'第一段…'}), N('g','videoGenerator')]
r=collectUpstreamInputs('g',nodes,[E('d','g')])
check('导演台的主题+大纲合成一段', r.texts[0]==='雪夜\n第一段…', JSON.stringify(r.texts))

console.log('\n— 上游是生成器时，取它产出的素材 —')
// 预设链路：文字 → 基准图生成器 → 多角度生成器
nodes=[
  N('t','text',{text:'角色描述'}),
  N('base','imageGenerator'),
  N('r1','image',{url:'http://a/base.png', sourceNodeId:'base'}),
  N('angles','imageGenerator'),
]
edges=[E('t','base'), E('base','r1'), E('base','angles')]
r=collectUpstreamInputs('angles',nodes,edges)
check('拿到的是基准生成器产出的图，不是生成器本身', r.imageUrls.join()==='http://a/base.png', JSON.stringify(r))
check('不会顺带把再上游的文字也算进来（只看一跳）', r.texts.length===0, JSON.stringify(r.texts))
// 生成器还没出结果
r=collectUpstreamInputs('angles',[N('base','imageGenerator'),N('angles','imageGenerator')],[E('base','angles')])
check('生成器还没出结果 → 空', r.imageUrls.length===0)

console.log('\n— 边界 —')
check('没有上游 → 全空', collectUpstreamInputs('g',[N('g','imageGenerator')],[]).imageUrls.length===0)
check('连线指向不存在的节点不报错', collectUpstreamInputs('g',[N('g','imageGenerator')],[E('missing','g')]).texts.length===0)
check('url 为 null 的图片节点被跳过',
  collectUpstreamInputs('g',[N('i','image',{url:null}),N('g','imageGenerator')],[E('i','g')]).imageUrls.length===0)
check('空白字符串的文字被跳过',
  collectUpstreamInputs('g',[N('t','text',{text:'   '}),N('g','imageGenerator')],[E('t','g')]).texts.length===0)
// 同一张图两条路径连进来
nodes=[N('i','image',{url:'http://a/x.png'}), N('g','imageGenerator')]
r=collectUpstreamInputs('g',nodes,[E('i','g'),{id:'e2',source:'i',target:'g',sourceHandle:'b'}])
check('同一张图连两条线只算一张', r.imageUrls.length===1, JSON.stringify(r.imageUrls))
// 下游方向不算
r=collectUpstreamInputs('g',[N('g','imageGenerator'),N('i','image',{url:'http://a/y.png'})],[E('g','i')])
check('下游节点不算输入', r.imageUrls.length===0)

console.log('\n— 混合 + 摘要 —')
nodes=[N('t','text',{text:'猫'}),N('i1','image',{url:'a'}),N('i2','image',{url:'b'}),N('v','video',{url:'c'}),N('p','promptGroup',{snippetIds:['s1']}),N('g','videoGenerator')]
edges=[E('t','g'),E('i1','g'),E('i2','g'),E('v','g'),E('p','g')]
r=collectUpstreamInputs('g',nodes,edges)
check('混合全收到', r.imageUrls.length===2 && r.videoUrls.length===1 && r.texts.length===1 && r.snippetIds.length===1, JSON.stringify(r))
// summarizeInputs 现在只给结构（几项、各多少），拼文案是组件按当前语言做的
const sig = (parts)=>parts.map(p=>`${p.kind}:${p.count}`).join('|')
check('摘要结构', sig(summarizeInputs(r))==='images:2|videos:1|texts:1|snippets:1', sig(summarizeInputs(r)))
check('摘要不含任何文案', summarizeInputs(r).every(p=>typeof p.count==='number' && !/[\u4e00-\u9fff]/.test(JSON.stringify(p))))
check('空输入摘要为空数组', summarizeInputs({texts:[],snippetIds:[],imageUrls:[],videoUrls:[],audioUrls:[]}).length===0)

console.log(fails===0?'\n全部通过':'\n'+fails+' 项失败')
process.exit(fails===0?0:1)
