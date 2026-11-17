#!/usr/bin/env node
// 为文章生成可下载的 Markdown 副本（使用日期：2026-11-17）
//
// docs 下的 Markdown 会被 VitePress 编译成 HTML，原文不会出现在构建产物里。
// 这里把论文精读和主题课程正文复制到 docs/public/{papers,guide}/files/，
// 站内「下载 Markdown」就能直接取到源文件。
//
// 副本是构建产物，已加入 .gitignore；npm run dev / npm run build 的 pre 钩子
// 会自动执行。PDF 放在同目录，由 npm run articles:pdf 生成并提交，
// 本脚本只清理失效的 .md，不会动 .pdf。

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import {
  docsRoot,
  getArticleTargets,
  publicRoot,
  renderDownloadMarkdown,
  writeGuideManifest,
} from './article-targets.mjs'

const targets = getArticleTargets()
const expected = new Map(targets.map((target) => [join(publicRoot, target.publicPath), target.source]))

for (const dir of new Set([...expected.keys()].map((path) => dirname(path)))) {
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    if (!expected.has(join(dir, name))) rmSync(join(dir, name))
  }
}

for (const [dest, source] of expected) {
  const sourceRel = relative(docsRoot, source).split(sep).join('/')
  writeFileSync(dest, renderDownloadMarkdown(readFileSync(source, 'utf8'), sourceRel))
}

const guideCount = writeGuideManifest()
console.log(`可下载文章 ${targets.length} 篇（教程正文 ${guideCount} 篇），Markdown 副本已同步`)
