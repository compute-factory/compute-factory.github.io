#!/usr/bin/env node
// 站内链接与静态资源的大小写守卫。
//
// 背景：本地开发机是 Windows（NTFS 不区分大小写），CI 和线上是 Linux（区分）。
// 链接写 /guide/HashMap 指向 hashmap.md 时，本地构建能过，线上直接 404。
// 这个脚本按字节严格比对文件名大小写，把这类错误挡在 PR 阶段。
//
// 用法：node scripts/check-assets.mjs [--strict]
//   --strict  找不到目标时也判失败（默认只告警，死链交给 vitepress build 兜底）

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
// --docs=<dir> 用于自测，正常构建不传
const docsArg = process.argv.find((arg) => arg.startsWith('--docs='))
const docsRoot = docsArg ? resolvePath(docsArg.slice('--docs='.length)) : join(repoRoot, 'docs')
const strict = process.argv.includes('--strict')

// ---------- 建立文件名索引 ----------

const allFiles = []

function collect(dirAbs, rel) {
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      // 跳过 .vitepress、node_modules 这类非站点内容
      if (entry.name.startsWith('.')) continue
      collect(join(dirAbs, entry.name), childRel)
    } else {
      allFiles.push(childRel)
    }
  }
}

collect(docsRoot, '')

const exactSet = new Set(allFiles)
const lowerMap = new Map(allFiles.map((f) => [f.toLowerCase(), f]))
const mdFiles = allFiles.filter((f) => f.endsWith('.md'))

// ---------- 逐行清理，避免误报 ----------

// 把代码块、行内代码、HTML 注释抹成空白，保持行号不变
function stripNoise(lines) {
  let inFence = false
  let fenceChar = ''
  let inComment = false

  return lines.map((line) => {
    if (inComment) {
      if (line.includes('-->')) inComment = false
      return ''
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      const char = fence[1][0]
      if (!inFence) {
        inFence = true
        fenceChar = char
      } else if (char === fenceChar) {
        inFence = false
      }
      return ''
    }
    if (inFence) return ''

    let out = line
    const start = out.indexOf('<!--')
    if (start !== -1) {
      const end = out.indexOf('-->', start + 4)
      if (end === -1) {
        inComment = true
        out = out.slice(0, start)
      } else {
        out = out.slice(0, start) + out.slice(end + 3)
      }
    }

    return out.replace(/`[^`\n]*`/g, '')
  })
}

// ---------- 提取链接 ----------

const MD_LINK = /!?\[[^\]]*\]\(\s*(<[^>\n]*>|[^)\s]+)/g
const HTML_ATTR = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function extractTargets(line) {
  const found = []
  for (const m of line.matchAll(MD_LINK)) found.push(m[1])
  for (const m of line.matchAll(HTML_ATTR)) found.push(m[1] ?? m[2])
  return found
}

// ---------- 解析与比对 ----------

function isSkippable(raw) {
  if (!raw) return true
  if (raw.startsWith('#') || raw.startsWith('//')) return true
  // http:、https:、mailto:、tel:、data: 等带协议的都不管
  return /^[a-z][a-z0-9+.-]*:/i.test(raw)
}

function candidatePaths(raw, mdRel) {
  let p = raw.trim()
  if (p.startsWith('<') && p.endsWith('>')) p = p.slice(1, -1)
  p = p.split('#')[0].split('?')[0]
  if (!p) return []

  try {
    p = decodeURIComponent(p)
  } catch {
    // 保持原样
  }

  const rootRelative = p.startsWith('/')
  const base = rootRelative ? p.slice(1) : posix.join(posix.dirname(mdRel), p)
  const norm = posix.normalize(base)
  if (norm.startsWith('..')) return []

  // 依次尝试：原样 -> 补 .md -> 目录下的 index.md
  const withVariants = (target) => {
    const list = [target]
    if (!/\.[a-z0-9]+$/i.test(target)) {
      list.push(`${target}.md`, posix.join(target, 'index.md'))
    }
    return list
  }

  const candidates = withVariants(norm)
  // 站内绝对路径优先按 docs 根解析，其次按 public 目录解析
  if (rootRelative) {
    candidates.push(...withVariants(posix.join('public', norm)))
  }
  return candidates
}

function resolve(targets) {
  for (const candidate of targets) {
    if (exactSet.has(candidate)) return { kind: 'ok' }
  }
  for (const candidate of targets) {
    const actual = lowerMap.get(candidate.toLowerCase())
    if (actual) return { kind: 'case', actual, wanted: candidate }
  }
  return { kind: 'missing', wanted: targets[0] }
}

// ---------- 主流程 ----------

const problems = []
const missing = []

for (const mdRel of mdFiles) {
  const raw = readFileSync(join(docsRoot, mdRel), 'utf8')
  const lines = stripNoise(raw.split(/\r?\n/))

  lines.forEach((line, index) => {
    for (const target of extractTargets(line)) {
      if (isSkippable(target)) continue

      const result = resolve(candidatePaths(target, mdRel))
      if (result.kind === 'ok') continue

      const record = {
        file: mdRel,
        line: index + 1,
        ref: target,
        wanted: result.wanted,
        actual: result.actual,
      }

      if (result.kind === 'case') problems.push(record)
      else missing.push(record)
    }
  })
}

function report(list, title) {
  if (list.length === 0) return
  console.log(`\n${title}`)
  for (const item of list) {
    console.log(`  docs/${item.file}:${item.line}`)
    console.log(`    引用: ${item.ref}`)
    console.log(`    期望: ${item.wanted}`)
    if (item.actual) console.log(`    实际: ${item.actual}`)
  }
}

console.log(`扫描 ${mdFiles.length} 个 Markdown 文件，${allFiles.length} 个文件`)

report(problems, '大小写不一致（本地能过，线上会 404）：')
report(missing, '找不到目标（可能是死链，或指向了构建产物）：')

const failed = problems.length > 0 || (strict && missing.length > 0)

if (failed) {
  console.log(`\n检查失败：${problems.length} 处大小写问题${strict ? `，${missing.length} 处找不到目标` : ''}`)
  process.exit(1)
}

if (missing.length > 0) {
  console.log(`\n通过大小写检查。另有 ${missing.length} 处目标未解析，请人工确认（加 --strict 可将其视为失败）。`)
} else {
  console.log('\n检查通过。')
}
