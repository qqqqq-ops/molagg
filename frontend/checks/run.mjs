/**
 * 画布 / 创作页的离线自测。
 *
 * 这些模块都是纯函数（解析、校验、拼装、i18n 对齐），不需要浏览器也不需要真实渠道，
 * 所以用 esbuild 打成 CJS 直接拿 node 跑。**跟真实上游有关的部分一条都测不到**，见各文件注释。
 *
 * 用法：cd frontend && node checks/run.mjs
 */
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const frontend = join(here, '..')

/** 产物名 → 入口。入口是 .ts 的用 checks/ 下的聚合文件，单模块的直接指源码 */
const BUNDLES = {
  'as.cjs': 'checks/as-entry.ts',
  'gi.cjs': 'checks/gi-entry.ts',
  'cv2.cjs': 'checks/cv2-entry.ts',
  'modes.cjs': 'checks/modes-entry.ts',
  'oc.cjs': 'src/components/features/create/config/outputCountOptions.ts',
  'ac.cjs': 'src/components/features/create/assetCompatibility.ts',
  'go.cjs': 'checks/go-entry.ts',
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
for (const [out, entry] of Object.entries(BUNDLES)) {
  execFileSync(
    npx,
    ['esbuild', entry, '--bundle', '--format=cjs', '--platform=node',
     '--tsconfig=tsconfig.json', `--outfile=checks/${out}`, '--log-level=error'],
    { cwd: frontend, stdio: 'inherit' },
  )
}
console.log('bundles ok\n')

let failed = 0
for (const file of readdirSync(here).filter((f) => f.startsWith('test-') && f.endsWith('.cjs')).sort()) {
  console.log(`\n══ ${file} ══`)
  try {
    execFileSync(process.execPath, [join(here, file)], { cwd: here, stdio: 'inherit' })
  } catch {
    failed += 1
  }
}
console.log(failed ? `\n${failed} 个测试文件不通过` : '\n全部测试通过')
process.exit(failed ? 1 : 0)
