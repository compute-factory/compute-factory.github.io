#!/usr/bin/env node
// 排版守卫：挡住绕开字号 token 与字体栈的写法。
//
// 背景：全站字体栈和字号都放在 docs/.vitepress/theme/worksite.css 的 :root 里。
// 一旦有人（或 agent）在组件里直接写 font-family、在规则里写死字号，
// 类型层级就会慢慢分叉，深色模式和打印稿也跟着走样。
//
// 规则：
//   1. font-family 只能引用 --vp-font-family-base / --vp-font-family-mono。
//   2. worksite.css 里（打印样式除外）的 font-size 必须取 --cf-font-*，
//      或者是 em / % 这类相对值。
//   3. worksite.css 里（token 块与打印样式除外）不写裸十六进制颜色。
//      组件里的裸色值目前只提示、不判失败。
//
// 用法：node scripts/check-typography.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const themeDir = join(repoRoot, 'docs', '.vitepress', 'theme')

const errors = []
const notes = []

/** 相对字号（em / %）与继承关键字是允许的，绝对像素值不行。 */
const isRelativeSize = (value) =>
  /(em|%)$/.test(value.trim()) ||
  /^(inherit|unset|initial|revert)$/.test(value.trim())

/** 收集 .css 与 .vue（style 块）文件，返回 [{ file, css, lineOffset }]。 */
function collectCssChunks() {
  const chunks = []

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name.endsWith('.css')) {
        chunks.push({ file: full, css: readFileSync(full, 'utf8'), lineOffset: 0 })
        continue
      }
      if (!entry.name.endsWith('.vue')) continue

      const source = readFileSync(full, 'utf8')
      const stylePattern = /<style[^>]*>([\s\S]*?)<\/style>/g
      for (const match of source.matchAll(stylePattern)) {
        const start = source.slice(0, match.index).split('\n').length - 1
        chunks.push({ file: full, css: match[1], lineOffset: start })
      }
    }
  }

  walk(themeDir)
  return chunks
}

/** 逐行扫描，记录花括号深度与祖先选择器，判断当前行所处的上下文。 */
function scanChunk({ file, css, lineOffset }, fileErrors) {
  const isGlobalSheet = file.endsWith('worksite.css')
  const lines = css.split(/\r?\n/)
  const stack = []

  lines.forEach((line, index) => {
    const lineNo = index + lineOffset
    const trimmed = line.trim()

    // 先进入本行打开的块，单行规则 `a { color: red }` 才能被当作块内声明检查
    const opensBlock = (trimmed.match(/\{/g) || []).length
    const closesBlock = (trimmed.match(/\}/g) || []).length
    const lineSelector = trimmed.split('{')[0].trim()
    for (let i = 0; i < opensBlock; i += 1) {
      stack.push(lineSelector || stack[stack.length - 1] || '')
    }

    const inTokenBlock = stack.some((selector) => selector.includes(':root') || selector.includes('.dark'))
    const inPrint = stack.some((selector) => selector.includes('print'))
    const inDeclarationBlock = stack.some((selector) => !selector.startsWith('@'))

    // 规则检查
    const fontFamily = line.match(/(^|[\s{;])font-family\s*:\s*([^;]+);/)
    if (fontFamily) {
      const value = fontFamily[2].trim()
      if (!/^var\(--vp-font-family-(base|mono)\)$/.test(value)) {
        fileErrors.push({
          line: lineNo,
          message: `font-family 只能写 var(--vp-font-family-base) 或 var(--vp-font-family-mono)，当前是 ${value}`,
        })
      }
    }

    const fontSize = line.match(/(^|[\s{;])font-size\s*:\s*([^;]+);/)
    if (fontSize && isGlobalSheet && !inPrint) {
      const value = fontSize[2].trim()
      const allowed = value.startsWith('var(--cf-font-') || isRelativeSize(value)
      if (!allowed) {
        fileErrors.push({
          line: lineNo,
          message: `font-size 请取 --cf-font-* 变量（写在 worksite.css 的 :root），当前是 ${value}`,
        })
      }
    }

    if (isGlobalSheet && !inTokenBlock && !inPrint && inDeclarationBlock) {
      const hex = line.match(/#[0-9a-fA-F]{3,8}\b/g)
      if (hex && !/var\(--/.test(line)) {
        fileErrors.push({
          line: lineNo,
          message: `不要写裸色值 ${hex.join(' ')}，请用 --cf-* 变量`,
        })
      }
    }

    if (!isGlobalSheet && !inTokenBlock) {
      const hex = line.match(/#[0-9a-fA-F]{6}\b/g)
      if (hex && !/var\(--/.test(line) && !/gradient|shadow|filter|mask/.test(line)) {
        notes.push({ file, line: lineNo, message: `组件内裸色值 ${hex.join(' ')}` })
      }
    }

    // 本行关闭的块在检查结束后出栈
    for (let i = 0; i < closesBlock; i += 1) stack.pop()
  })
}

const chunks = collectCssChunks()

for (const chunk of chunks) {
  const fileErrors = []
  scanChunk(chunk, fileErrors)
  for (const error of fileErrors) {
    errors.push({ file: relative(repoRoot, chunk.file).split(sep).join('/'), ...error })
  }
}

const rel = (file) => relative(repoRoot, file).split(sep).join('/')

if (errors.length > 0) {
  console.log('\n排版规范问题：')
  for (const error of errors) {
    console.log(`  ${error.file}:${error.line}`)
    console.log(`    ${error.message}`)
  }
}

if (notes.length > 0) {
  console.log(`\n提示（不判失败）：组件里还有 ${notes.length} 处裸色值，后续可以换成 --cf-* 变量。`)
}

if (errors.length > 0) {
  console.log(`\n检查失败：${errors.length} 处排版问题。规则见 AGENTS.md 的「排版与字体」。`)
  process.exit(1)
}

console.log(`排版检查通过：${chunks.length} 个样式片段，字体栈与字号均走变量。`)
