// 前端的 ESLint 扁平配置（Vite + React 19 + TS）。
//
// 为什么有这个文件：ESLint 9 从 frontend/ 往上找配置，会捡到仓库根的 eslint.config.mts。
// 那是给后端（NestJS）用的，而且是 .mts —— 加载 TS 配置需要 jiti v2，
// 但 frontend/node_modules 里被提升的是 jiti 1.x，于是直接报 "outdated version of the 'jiti' library" 退出。
// 这里用 .mjs（原生 ESM，不经过 jiti），前端就用自己这份，也不再往上走。
//
// 原来的 frontend/.eslintrc.json 已删除：它 extends "next/core-web-vitals"，
// 但这个项目早就从 Next 迁到 Vite，eslint-config-next 根本没装，那份配置是死的。

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.backup-*/**', 'public/**', 'serve-dist.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Vite 的 HMR 要求模块只导出组件；这个仓库里有不少文件同时导出常量和组件，
      // 真拆起来影响面太大，先降成警告。
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // 跟仓库根 .eslintrc.js 的口径保持一致：any 不拦（适配各家上游千奇百怪的响应），
      // 未使用变量只警告，且允许 _ 开头的占位参数。
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
)
