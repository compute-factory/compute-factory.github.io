#!/usr/bin/env node
// 站点可下载文章的清单（使用日期：2026-11-17）
//
// 论文精读页和主题课程的真实正文页都提供 Markdown / PDF 下载：
// - 论文：docs/papers/*.md，排除 index.md
// - 教程：docs/guide/**/*.md，排除 index.md 和仍为 <ChapterPlaceholder /> 的占位章
//
// 下载副本发布在 docs/public/{papers,guide}/files/，构建前由同步脚本生成；
// PDF 用无头浏览器打印后提交，并在文章目录生成 guide-downloads.generated.ts，
// 让页面知道自己有没有 PDF。

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE_URL = 'http://www.compute-factory.com'

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
export const docsRoot = join(repoRoot, 'docs')
export const publicRoot = join(docsRoot, 'public')
const manifestFile = join(docsRoot, '.vitepress', 'content', 'guide-downloads.generated.ts')

const toPosix = (path) => path.split(sep).join('/')

function* walkMarkdown(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkMarkdown(full)
    else if (entry.name.endsWith('.md')) yield full
  }
}

/** 返回所有提供下载的文章。publicPath 相对 docs/public。 */
export function getArticleTargets() {
  const targets = []

  for (const name of readdirSync(join(docsRoot, 'papers'))) {
    if (!name.endsWith('.md') || name === 'index.md') continue
    const slug = name.replace(/\.md$/, '')
    targets.push({
      kind: 'paper',
      id: slug,
      source: join(docsRoot, 'papers', name),
      route: `/papers/${slug}.html`,
      publicPath: `papers/files/${name}`,
    })
  }

  for (const source of walkMarkdown(join(docsRoot, 'guide'))) {
    const rel = toPosix(relative(docsRoot, source))
    if (rel.endsWith('/index.md')) continue
    // 占位章节没有正文，不提供下载
    if (readFileSync(source, 'utf8').includes('<ChapterPlaceholder')) continue
    targets.push({
      kind: 'guide',
      id: rel.slice('guide/'.length).replace(/\.md$/, ''),
      source,
      route: `/${rel.replace(/\.md$/, '.html')}`,
      publicPath: `guide/files/${rel.slice('guide/'.length)}`,
    })
  }

  return targets
}

export function targetPublicFile(target, ext) {
  return join(publicRoot, target.publicPath.replace(/\.md$/, `.${ext}`))
}

/**
 * 下载用的 Markdown 副本：把站内相对链接改写成线上绝对地址，
 * 这样读者把文件存到本地打开时，链接和图片仍然可用。
 */
export function renderDownloadMarkdown(sourceText, sourceRel) {
  let inFence = false

  return sourceText
    .split('\n')
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/)
      if (fence) {
        inFence = !inFence
        return line
      }
      if (inFence) return line

      return line.replace(/(!?\[[^\]]*\]\()(\s*<?)([^)\s>]+)(>?\s*\))/g, (all, head, space, target, tail) => {
        if (/^(https?:|mailto:|tel:|data:|#)/i.test(target)) return all

        const [pathname, ...rest] = target.split(/(?=[#?])/)
        const suffix = rest.join('')
        let resolved = pathname.startsWith('/')
          ? pathname
          : '/' + posix.normalize(posix.join(posix.dirname(sourceRel), pathname))

        if (resolved.startsWith('/..')) return all

        resolved = resolved
          .replace(/\.md(?=$|[#?])/, '.html')
          .replace(/\/index\.html(?=$|[#?])/, '/')

        return `${head}${space}${SITE_URL}${resolved}${suffix}${tail}`
      })
    })
    .join('\n')
}

/** 生成页面上用的下载清单：路由 -> { md, pdf }。 */
export function writeGuideManifest() {
  const entries = {}

  for (const target of getArticleTargets()) {
    if (target.kind !== 'guide') continue
    entries[target.route.replace(/\.html$/, '')] = {
      md: existsSync(targetPublicFile(target, 'md')),
      pdf: existsSync(targetPublicFile(target, 'pdf')),
    }
  }

  mkdirSync(dirname(manifestFile), { recursive: true })
  writeFileSync(
    manifestFile,
    [
      '// 由 scripts/sync-article-downloads.mjs 生成，不要手动修改。',
      'export interface GuideDownload { md: boolean; pdf: boolean }',
      '',
      `export const guideDownloads: Record<string, GuideDownload> = ${JSON.stringify(entries, null, 2)}`,
      '',
    ].join('\n'),
  )

  return Object.keys(entries).length
}
