/**
 * MolaggOpenaiVideoAdapter 离线自测（不联网、不用 key）。
 * 只验纯逻辑：白名单拼包(只发 model/prompt/seconds/size/images)、秒数按模型夹取、比例→size、参考图公网校验。
 * 跑：npx ts-node scripts/test-molagg-openai-adapter.ts
 */
import { ApiChannel } from '@prisma/client';

import { MolaggOpenaiVideoAdapter } from '../src/adapters/molagg/molagg-openai-video.adapter';

const channel = { baseUrl: 'https://api.molagg.com', apiKey: '' } as unknown as ApiChannel;
const a = new MolaggOpenaiVideoAdapter(channel);

let fails = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) console.log('  ✓ ' + name);
  else {
    fails += 1;
    console.log('  ✗ ' + name + (extra ? ' — ' + extra : ''));
  }
};
const body = (p: Record<string, unknown>) => a.transformParams(p as any) as Record<string, unknown>;

console.log('— 白名单拼包：只发 model/prompt/seconds/size/images —');
const b1 = body({ model: 'seedance-2.5-pro', prompt: 'hi', ratio: '16:9', images: ['https://cdn.x.com/a.png'] });
check('含 model/prompt/seconds/size', !!b1.model && !!b1.prompt && !!b1.seconds && !!b1.size);
check('不含 mode/count/duration/resolution/aspect_ratio', ['mode', 'count', 'duration', 'resolution', 'aspect_ratio'].every((k) => !(k in b1)), JSON.stringify(b1));
check('seconds 是字符串', typeof b1.seconds === 'string');
check('images 透传', Array.isArray(b1.images) && (b1.images as string[])[0] === 'https://cdn.x.com/a.png');

console.log('\n— 比例 → size —');
check('16:9 → 1280x720', body({ model: 'seedance-2.5-pro', prompt: 'x', ratio: '16:9' }).size === '1280x720');
check('9:16 → 720x1280', body({ model: 'seedance-2.5-pro', prompt: 'x', ratio: '9:16' }).size === '720x1280');
check('1080p + 16:9 → 1920x1080', body({ model: 'seedance-2.5-pro', prompt: 'x', ratio: '16:9', resolution: '1080p' }).size === '1920x1080');
check('显式 size 原样保留', body({ model: 'seedance-2.5-pro', prompt: 'x', size: '640x360' }).size === '640x360');
check('没比例兜底 1280x720', body({ model: 'seedance-2.5-pro', prompt: 'x' }).size === '1280x720');

console.log('\n— 秒数按模型夹取 —');
check('缺省 = 5', body({ model: 'seedance-2.5-pro', prompt: 'x' }).seconds === '5');
check('2.5-pro 上限 30(传100→30)', body({ model: 'seedance-2.5-pro', prompt: 'x', seconds: '100' }).seconds === '30');
check('2.0-mini 上限 15(传30→15)', body({ model: 'seedance-2.0-mini', prompt: 'x', seconds: '30' }).seconds === '15');
check('低于下限 5(传2→5)', body({ model: 'seedance-2.5-pro', prompt: 'x', seconds: '2' }).seconds === '5');

console.log('\n— 参考图归并 + 公网校验 —');
check('firstFrame/referenceImage 都并进 images', (() => {
  const b = body({ model: 'seedance-2.5-pro', prompt: 'x', firstFrame: 'https://cdn.x.com/f.png', referenceImage: 'https://cdn.x.com/r.png' });
  const imgs = (b.images as string[]) ?? [];
  return imgs.includes('https://cdn.x.com/f.png') && imgs.includes('https://cdn.x.com/r.png');
})());
check('重复地址去重', (() => {
  const b = body({ model: 'seedance-2.5-pro', prompt: 'x', images: ['https://cdn.x.com/a.png', 'https://cdn.x.com/a.png'] });
  return (b.images as string[]).length === 1;
})());

console.log('\n— validateParams —');
check('缺 model 报错', !a.validateParams({ prompt: 'x' }).valid);
check('缺 prompt 报错', !a.validateParams({ model: 'seedance-2.5-pro' }).valid);
check('prompt 超 5000 报错', !a.validateParams({ model: 'seedance-2.5-pro', prompt: 'a'.repeat(5001) }).valid);
check('localhost 参考图报错', !a.validateParams({ model: 'seedance-2.5-pro', prompt: 'x', images: ['http://localhost:3000/uploads/a.png'] }).valid);
check('base64 参考图报错', !a.validateParams({ model: 'seedance-2.5-pro', prompt: 'x', images: ['data:image/png;base64,AAAA'] }).valid);
check('超 30 张报错', !a.validateParams({ model: 'seedance-2.5-pro', prompt: 'x', images: Array.from({ length: 31 }, (_, i) => `https://cdn.x.com/${i}.png`) }).valid);
check('公网直链 + 齐全 → valid', a.validateParams({ model: 'seedance-2.5-pro', prompt: 'x', images: ['https://cdn.x.com/a.png'] }).valid);
check('纯文字(无图) → valid', a.validateParams({ model: 'seedance-2.5-pro', prompt: 'x' }).valid);

console.log(fails ? `\n${fails} 处不通过` : '\n全部通过');
process.exit(fails ? 1 : 0);
