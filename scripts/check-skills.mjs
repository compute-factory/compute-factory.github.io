#!/usr/bin/env node
// 技能结构守卫：保证 skills/ 下的每个技能都能被 agent 直接读取。
//
// 规则：
//   1. skills/<name>/SKILL.md 必须存在，frontmatter 里要有 name 与 description。
//   2. frontmatter 的 name 必须与目录名一致。
//   3. SKILL.md 里引用的 references/、scripts/、assets/ 文件必须真实存在。
//   4. 技能目录里不允许空文件。
//
// 用法：node scripts/check-skills.mjs

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const skillsDir = join(repoRoot, 'skills')

const errors = []
const skills = []

const rel = (path) => relative(repoRoot, path).split(sep).join('/')

function readFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  const values = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.+)$/)
    if (!kv) continue
    values[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

function collectFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(full))
    else files.push(full)
  }
  return files
}

if (!existsSync(skillsDir)) {
  console.log('没有 skills/ 目录，跳过技能检查。')
  process.exit(0)
}

const entries = readdirSync(skillsDir, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory(),
)

for (const entry of entries) {
  const skillDir = join(skillsDir, entry.name)
  const skillFile = join(skillDir, 'SKILL.md')

  if (!existsSync(skillFile)) {
    errors.push(`${rel(skillDir)}: 缺少 SKILL.md`)
    continue
  }

  const text = readFileSync(skillFile, 'utf8')
  const frontmatter = readFrontmatter(text)
  if (!frontmatter) {
    errors.push(`${rel(skillFile)}: 缺少 frontmatter`)
  } else {
    if (!frontmatter.name) errors.push(`${rel(skillFile)}: frontmatter 缺少 name`)
    else if (frontmatter.name !== entry.name) {
      errors.push(`${rel(skillFile)}: name「${frontmatter.name}」与目录名「${entry.name}」不一致`)
    }
    if (!frontmatter.description) errors.push(`${rel(skillFile)}: frontmatter 缺少 description`)
  }

  const referenced = new Set(
    [...text.matchAll(/\b(references|scripts|assets)\/[A-Za-z0-9._-]+/g)].map((match) => match[0]),
  )
  for (const ref of referenced) {
    if (!existsSync(join(skillDir, ref))) {
      errors.push(`${rel(skillFile)}: 引用的 ${ref} 不存在`)
    }
  }

  for (const file of collectFiles(skillDir)) {
    if (file.endsWith('SKILL.md')) continue
    if (statSync(file).size === 0) errors.push(`${rel(file)}: 空文件`)
  }

  skills.push({ name: entry.name, refs: referenced.size })
}

if (errors.length > 0) {
  console.log('\n技能结构问题：')
  for (const error of errors) console.log(`  ${error}`)
  console.log(`\n检查失败：${errors.length} 处。规则见 skills/README.md。`)
  process.exit(1)
}

const summary = skills.map((skill) => `${skill.name}（${skill.refs} 个引用）`).join('、')
console.log(`技能检查通过：${skills.length} 个（${summary}），结构与引用完整。`)
