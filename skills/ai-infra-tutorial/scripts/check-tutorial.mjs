#!/usr/bin/env node
// AI Infra 教学文章规范与排版校验：
// 1. 禁用口吻（论文腔、客服腔）与模糊兜底词提醒
// 2. 标题层级预算（1 个 H1、4–8 个 H2、<= 18 个 H3、允许 H4、总标题 <= 30、父子标题间引导段与硬件脱敏）
// 3. 疑似比喻词检查
// 4. 「一步一换行」推导排版、MathJax 伪代码、私有路径泄漏与 ::: details 折叠框检查
// 5. 本地图片 / SVG 引用存在性（兼容 ./images/... 与站点 /images/...）及 SVG 内联属性检查
// 6. 可选第二个参数 <参考文档.txt>：核对数字是否在参考原文中出现
// 用法：node check-tutorial.mjs <教程.md> [参考文档.txt] [--strict] [--json]

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const BANNED = [
  '本文提出', '本文认为', '本文介绍', '本文将', '笔者',
  '我们可以看到', '不难发现', '值得注意的是',
  '综上所述', '总的来说', '众所周知',
  '希望对你有帮助', '如有疑问', '让我们',
  '具有重要的理论意义', '具有重要的实用价值',
]

const HEDGING = [
  '或许', '也许', '似乎', '大概',
  '不能确定', '难以断言', '有待进一步研究', '尚无定论',
]

const UNIT_RE = '(?:%|GiB|GB|MB|KB|TB|TiB|GFLOPs|TFLOPs|FLOPs|ms|μs|us|ns|min|分钟|小时|天|倍)'
const NUM_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_RE})?`, 'gi')

function usage() {
  console.log(`用法: node check-tutorial.mjs <教程.md> [参考文档.txt] [--strict] [--json]

  --strict   发现禁用口吻、标题违规、推导/折叠问题或缺失图片时以退出码 1 结束
  --json     输出 JSON，便于其他脚本消费`)
  process.exit(0)
}

function clean(s) {
  return s
    .replace(/\u0000/g, ' ')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，]/g, ',')
    .replace(/[％]/g, '%')
    .replace(/[–—]/g, '-')
    .replace(/[×✕]/g, 'x')
    .replace(/[μµ]/g, 'u')
}

function dense(s) {
  return clean(s).replace(/,/g, '').replace(/\s+/g, '').toLowerCase()
}

function loose(s) {
  return clean(s).replace(/,/g, '').replace(/\s+/g, ' ').toLowerCase()
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripForScan(text) {
  const lines = text.split(/\r?\n/)
  const out = new Array(lines.length).fill('')
  let inFence = false
  let inMath = false

  let start = 0
  if (lines[0]?.trim() === '---') {
    let j = 1
    while (j < lines.length && lines[j].trim() !== '---') j++
    start = j + 1
  }

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (/^```/.test(trimmed)) { inFence = !inFence; continue }
    if (inFence) continue

    if (/^\$\$/.test(trimmed)) {
      if (trimmed.length > 2 && trimmed.endsWith('$$')) continue
      inMath = !inMath
      continue
    }
    if (inMath) continue

    if (/<!--\s*derived\s*-->/i.test(raw)) continue

    out[i] = raw
      .replace(/<!--.*?-->/g, ' ')
      .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
      .replace(/&[a-zA-Z]+;/g, ' ')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/`[^`]*`/g, ' ')
      .replace(/\$[^$]*\$/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/§\s*\d+(?:\.\d+)*/g, ' § ')
      .replace(/\b(?:p|pp)\.\s*\d+/gi, ' ')
  }
  return out
}

function isSignificant(digits, unit) {
  const bare = digits.replace(/,/g, '')
  if (unit) return true
  if (bare.includes('.')) return true
  return bare.length >= 2
}

function numberInRef(bare, unit, refLoose, refDense) {
  if (unit) {
    const withUnit = dense(bare + unit)
    if (refDense.includes(withUnit)) return true
  }
  const re = new RegExp(`(?<![\\d.])${escapeRegExp(bare)}(?![\\d.])`)
  return re.test(refLoose)
}

function checkDerivationAndDetails(originalLines) {
  const derivationIssues = []
  const detailsIssues = []
  let detailsCount = 0
  let inFence = false
  let inMath = false
  let inDetails = false
  let detailsStartLine = 0

  // 检测真实个人主目录路径（放行 /home/user、/Users/user、C:\Users\user 等通用示例占位符）
  const PRIVATE_PATH_RE = /(?:\/home\/(?!(?:user|username|your-user)\b)[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\(?!(?:user|username|your-user|Public|Default)\b)[A-Za-z0-9._-]+\\|\/Users\/(?!(?:user|username|your-user|Shared)\b)[A-Za-z0-9._-]+\/)/i

  for (let i = 0; i < originalLines.length; i++) {
    const raw = originalLines[i]
    const trimmed = raw.trim()

    if (/^```/.test(trimmed)) {
      if (!inFence && /^```mermaid\b/i.test(trimmed)) {
        derivationIssues.push({
          line: i + 1,
          type: '禁止 Mermaid 代码块',
          detail: '站点未装配 Mermaid 插件，请改用内联属性 SVG 或核实原图',
        })
      }
      inFence = !inFence
      continue
    }
    if (PRIVATE_PATH_RE.test(raw)) {
      derivationIssues.push({
        line: i + 1,
        type: '禁止暴露作者私有路径',
        detail: `${trimmed.slice(0, 68)}（请改用 /path/to/... 或 ~/... 等通用草拟路径并提示读者替换）`,
      })
    }
    if (inFence) {
      if (/^(算法|Algorithm)\s*\d+/i.test(trimmed) || /∈\s*R\^|\browmax\(|\browsum\(|[A-Za-z]_[ij]\b/.test(trimmed)) {
        derivationIssues.push({
          line: i + 1,
          type: '伪代码代码块未渲染数学符号',
          detail: `${trimmed.slice(0, 68)}（严禁用 \`\`\`text 写算法伪代码，应改用 > 引用块 + $...$ MathJax 公式并放入 ::: details）`,
        })
      }
      if (/\bcat\s+<<\s*['"]?[A-Za-z0-9_]+['"]?\s*>\s*\S+/.test(trimmed)) {
        derivationIssues.push({
          line: i + 1,
          type: '禁止使用 heredoc 写源码文件',
          detail: `${trimmed.slice(0, 68)}（请引导读者新建文件并单独给出对应语言代码块）`,
        })
      }
      continue
    }

    if (/^:::\s*details(?:\s+(.*))?$/.test(trimmed)) {
      const m = /^:::\s*details(?:\s+(.*))?$/.exec(trimmed)
      const summary = (m[1] || '').trim()
      detailsCount++
      if (inDetails) {
        detailsIssues.push({ line: i + 1, type: '折叠框未闭合或嵌套', detail: `上一折叠框始于 L${detailsStartLine}` })
      }
      inDetails = true
      detailsStartLine = i + 1
      if (!summary || /^(详细推导|更多细节|展开|详情)$/.test(summary)) {
        detailsIssues.push({ line: i + 1, type: '折叠框标题过于笼统', detail: trimmed })
      }
      if (/\b(?:RTX\s*\d{4}(?:\s*Ti|\s*SUPER)?|GTX\s*\d{4}|H100|H200|B100|B200|A100|A800|H800|L40S?|V100)\b/i.test(summary)) {
        detailsIssues.push({ line: i + 1, type: '折叠框标题禁止出现具体显卡型号', detail: `${summary}（仅在实测环境说明中交代硬件）` })
      }
      continue
    }
    if (inDetails && /^:::\s*(tip|warning|danger|info|details)\b/.test(trimmed)) {
      detailsIssues.push({
        line: i + 1,
        type: '折叠框内禁止嵌套 ::: 容器',
        detail: `${trimmed}（会导致外层 details 提前闭合，请改用 > 引用块）`,
      })
      continue
    }
    if (inDetails && /^:::$/.test(trimmed)) {
      inDetails = false
      continue
    }

    if (/^\$\$/.test(trimmed)) {
      if (trimmed.length > 2 && trimmed.endsWith('$$')) {
        const eqCount = (trimmed.replace(/[<>!]=|\\[lg]e|\\ne/g, '').match(/=/g) || []).length
        if (eqCount >= 3 && !trimmed.includes('\\\\')) {
          derivationIssues.push({
            line: i + 1,
            type: '单行长连等式',
            detail: `单行含 ${eqCount} 个等号，应改用 aligned 块一步一换行`,
          })
        }
        continue
      }
      inMath = !inMath
      continue
    }

    if (inMath) {
      const lineWithoutBreak = trimmed
        .replace(/\\\\.*$/, '')
        .replace(/\\tag\{[^}]*\}/g, '')
        .replace(/\\text\{[^}]*\}/g, '')
        .replace(/[_^]\{[^}]*\}/g, '')
        .replace(/[<>!]=|\\[lg]e|\\ne/g, '')
      const subExprs = lineWithoutBreak.split(/\\q?quad\b/)
      for (const expr of subExprs) {
        const eqCount = (expr.match(/=/g) || []).length
        const hasApprox = /\\approx\b/.test(expr)
        if (eqCount >= 2 && !trimmed.includes('&=')) {
          derivationIssues.push({
            line: i + 1,
            type: '单行长连等式',
            detail: `单条式子含 ${eqCount} 个连续等号（${trimmed.slice(0, 60)}...），推导应拆分为 aligned 一步一换行`,
          })
          break
        }
        if (eqCount >= 1 && hasApprox) {
          derivationIssues.push({
            line: i + 1,
            type: '精确式与约等混写同行',
            detail: `同一行混写 = 与 \\approx（${trimmed.slice(0, 60)}...），应拆为「精确展开」与「数值近似」两行`,
          })
          break
        }
      }
      continue
    }

    if (/<span\b[^>]*style\s*=\s*["'][^"']*color\s*:/i.test(trimmed)) {
      derivationIssues.push({
        line: i + 1,
        type: '禁止多色文字内联样式',
        detail: `${trimmed.slice(0, 68)}...（请改用单一暖底 <mark>...</mark> 突出最关键的 1–2 处结论）`,
      })
    }

    const proseLine = trimmed
      .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
      .replace(/&[a-zA-Z]+;/g, ' ')
    const isTableRow = /^\|/.test(proseLine)
    const isListLine = /^(?:[-*+]|\d+\.)\s+/.test(proseLine)
    if (!isTableRow && /[；;]/.test(proseLine)) {
      const sentences = isListLine ? [proseLine] : proseLine.split('。')
      for (const sent of sentences) {
        if (!/[；;]/.test(sent)) continue
        const clauses = sent.split(/[；;]/)
        const mathFormulaClauses = clauses.filter(
          (c) => /\$[^$]+=[^$]+\$/.test(c) && (isListLine || /(由|可知|可得|代入|进而|最后|得到|满足)/.test(c))
        )
        if (mathFormulaClauses.length >= 2) {
          derivationIssues.push({
            line: i + 1,
            type: isListLine ? '单条列表项串联多步动作' : '自然段内分号串联推导',
            detail: `${sent.trim().slice(0, 72)}...（应拆成一步一换行）`,
          })
          break
        }
      }
    }

    const inlineMaths = trimmed.match(/\$[^$]+\$/g) || []
    for (const im of inlineMaths) {
      const cleanedIm = im
        .slice(1, -1)
        .replace(/\[[^\]]*\]/g, '[]')
        .replace(/[_^]\{[^}]*\}/g, '')
        .replace(/[<>!]=|\\[lg]e|\\ne/g, '')
      const subAssignments = cleanedIm.split(/[,;]/)
      let flagged = false
      for (const sub of subAssignments) {
        const eqCount = (sub.match(/=/g) || []).length
        const hasArithmeticOp = /[+\-*/]|\\(?:frac|sum|exp|dot|cdot)/.test(sub)
        if (eqCount >= 3 && hasArithmeticOp) {
          derivationIssues.push({
            line: i + 1,
            type: '行内长连等式',
            detail: `行内单条式子含 ${eqCount} 个连续等号（$${sub.trim().slice(0, 56)}$...），应改为独立 aligned 块一步一换行`,
          })
          flagged = true
          break
        }
      }
      if (flagged) break
    }
  }

  if (inDetails) {
    detailsIssues.push({ line: detailsStartLine, type: '折叠框未闭合', detail: '缺少结尾 :::' })
  }
  if (detailsCount === 0) {
    detailsIssues.push({ line: 0, type: '缺少折叠深读层', detail: '全文未使用 ::: details 折叠框收纳脚本、推导或算例' })
  }

  return { derivationIssues, detailsIssues, detailsCount }
}

// 检查「代码/命令 + 原始输出」块（尤其在 ::: details 内部）是否缺少输出解读与分析
function checkCommandOutputAnalysis(originalLines) {
  const analysisIssues = []
  let inDetails = false
  let detailsStartLine = 0
  let detailsBlocks = []
  let inFence = false
  let fenceStart = 0
  let fenceLang = ''
  let lastFenceEnd = -1
  let proseAfterLastFence = false

  for (let i = 0; i < originalLines.length; i++) {
    const trimmed = originalLines[i].trim()
    if (!inFence && /^:::\s*details\b/.test(trimmed)) {
      inDetails = true
      detailsStartLine = i + 1
      detailsBlocks = []
      lastFenceEnd = -1
      proseAfterLastFence = false
      continue
    }
    if (!inFence && inDetails && /^:::$/.test(trimmed)) {
      if (detailsBlocks.length >= 2 && !proseAfterLastFence) {
        const hasOutputLike = detailsBlocks.some((b) => /^(text|log|console|bash|sh|output)?$/i.test(b.lang))
        if (hasOutputLike) {
          analysisIssues.push({
            line: detailsStartLine,
            type: '拓展命令/输出缺少结果分析',
            detail: `L${detailsStartLine} 的 ::: details 包含 ${detailsBlocks.length} 个代码块，但末尾代码块后缺少文字分析与解读`,
          })
        }
      }
      inDetails = false
      continue
    }
    if (/^```/.test(trimmed)) {
      if (!inFence) {
        inFence = true
        fenceStart = i + 1
        fenceLang = trimmed.slice(3).trim()
      } else {
        inFence = false
        if (inDetails) {
          detailsBlocks.push({ start: fenceStart, end: i + 1, lang: fenceLang })
          lastFenceEnd = i + 1
          proseAfterLastFence = false
        }
      }
      continue
    }
    if (!inFence && inDetails && lastFenceEnd > 0 && trimmed.length > 0 && !/^>/.test(trimmed)) {
      proseAfterLastFence = true
    }
  }

  return analysisIssues
}

function getImageDimensions(fullPath) {
  const ext = fullPath.toLowerCase()
  const buf = readFileSync(fullPath)
  if (ext.endsWith('.png') && buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if ((ext.endsWith('.jpg') || ext.endsWith('.jpeg')) && buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) { offset++; continue }
      const marker = buf[offset + 1]
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue }
      const segLen = buf.readUInt16BE(offset + 2)
      if (segLen < 2) break
      offset += 2 + segLen
    }
  }
  if (ext.endsWith('.svg')) {
    const svg = buf.toString('utf8')
    const vb = /viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i.exec(svg)
    if (vb) return { width: Number(vb[1]), height: Number(vb[2]) }
  }
  return null
}

function resolveLocalImagePath(reportDir, target) {
  if (/^\.\.?\//.test(target)) {
    return resolve(reportDir, target)
  }
  if (target.startsWith('/images/')) {
    // 尝试从 docs/guide/<section>/ 或 docs/<section>/ 向上定位 docs/public/images/...
    for (const relPrefix of ['../../public', '../public', './public', '../../../docs/public']) {
      const candidate = resolve(reportDir, relPrefix + target)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function checkImages(originalLines, reportDir) {
  const imageIssues = []
  let imageCount = 0
  let officialSourceImageCount = 0
  let inFence = false

  const OFFICIAL_HOST_RE = /https?:\/\/(?:[\w.-]+\.)?(?:nvidia\.com|pytorch\.org|arxiv\.org|vllm\.ai|sglang\.io|triton-lang\.org|github\.com|usenix\.org|huggingface\.co|jax-ml\.github\.io|stanford\.edu|berkeley\.edu|openmlsys\.github\.io)\b/i

  for (let i = 0; i < originalLines.length; i++) {
    const trimmed = originalLines[i].trim()
    if (/^```/.test(trimmed)) { inFence = !inFence; continue }
    if (inFence) continue

    const re = /!\[[^\]]*\]\(([^)]+)\)/g
    let m
    while ((m = re.exec(originalLines[i])) !== null) {
      imageCount++
      const target = m[1].trim()
      if (/^[a-zA-Z]:[\\/]/.test(target) || /^file:\/\//i.test(target)) {
        imageIssues.push({
          line: i + 1,
          type: '本机绝对路径配图',
          detail: `${target}（应使用相对路径 ./images/... 或站点根路径 /images/...）`,
        })
        continue
      }
      const fullPath = resolveLocalImagePath(reportDir, target)
      if (/^\.\.?\//.test(target) && (!fullPath || !existsSync(fullPath))) {
        imageIssues.push({
          line: i + 1,
          type: '图片文件不存在',
          detail: `${target} -> ${fullPath}`,
        })
      } else if (fullPath && existsSync(fullPath) && fullPath.toLowerCase().endsWith('.svg')) {
        const svg = readFileSync(fullPath, 'utf8')
        if (/<style\b/i.test(svg)) {
          imageIssues.push({
            line: i + 1,
            type: 'SVG 含有 <style> 标签',
            detail: `${target}（必须使用内联属性以兼容所有渲染器，并务必渲染 PNG 检查文字不越框）`,
          })
        }
        if (/font-weight\s*=\s*["']600["']/i.test(svg)) {
          imageIssues.push({
            line: i + 1,
            type: 'SVG 使用禁用字重 600',
            detail: `${target}（部分系统字体仅支持 400/700 物理字重，600 会合成发虚）`,
          })
        }
        if (/<text\b/i.test(svg) && !/Inter,\s*HarmonyOS Sans SC/i.test(svg)) {
          imageIssues.push({
            line: i + 1,
            type: 'SVG 缺少站点标准字体栈',
            detail: `${target}（须声明 Inter, HarmonyOS Sans SC, PingFang SC, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif）`,
          })
        }
        if (!/#fffdf7/i.test(svg) || !/#ebe3d0/i.test(svg) || !/feDropShadow/i.test(svg)) {
          imageIssues.push({
            line: i + 1,
            type: 'SVG 缺少外圈暖黄光晕框线',
            detail: `${target}（须使用 #fffdf7 外底板 + #ebe3d0 圆角白卡与 feDropShadow 形成统一外圈光晕）`,
          })
        }
      }
      // 检查图片下方 1-3 行图注是否带有官方一手来源链接
      const nearby = originalLines.slice(i + 1, i + 4).join(' ')
      const isOfficial = OFFICIAL_HOST_RE.test(nearby) && /(?:来源|出处|截取自|原图)/.test(nearby)
      if (isOfficial) {
        officialSourceImageCount++
      } else if (fullPath && existsSync(fullPath)) {
        const dims = getImageDimensions(fullPath)
        if (dims && dims.height > 0 && dims.width / dims.height < 1.4) {
          imageIssues.push({
            line: i + 1,
            type: '自制配图非横向宽屏比例',
            detail: `${target} 尺寸 ${dims.width}×${dims.height}（宽高比 ${(dims.width / dims.height).toFixed(2)} < 1.40，优先生成 16:9 等横向图避免占满整屏）`,
          })
        }
      }
    }
  }

  if (imageCount === 0) {
    imageIssues.push({
      line: 0,
      type: '缺少架构或流程配图',
      detail: '教学文章遇到架构、数据流或阶段对比时应主动配图并核查',
    })
  }
  if (officialSourceImageCount === 0) {
    imageIssues.push({
      line: 0,
      type: '缺少网络官方高质量图片',
      detail: '每篇教程必须包含至少 1 张来自官网/官方文档/原论文的高质量图片（本地保存并在图注中标明「来源：[...](官方URL)」）',
    })
  }

  return { imageIssues, imageCount, officialSourceImageCount }
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) usage()

  const strict = argv.includes('--strict')
  const asJson = argv.includes('--json')
  const files = argv.filter((a) => !a.startsWith('--'))
  if (files.length < 1) usage()

  const [reportPath, refPath] = files
  const report = readFileSync(reportPath, 'utf8')
  const originalLines = report.split(/\r?\n/)

  let refStats = null
  if (refPath) {
    const refText = readFileSync(refPath, 'utf8')
    const refLoose = loose(refText)
    const refDense = dense(refText)
    const scanLines = stripForScan(report)
    const unmatched = []
    let matchedCount = 0
    let skippedSmall = 0

    scanLines.forEach((line, idx) => {
      if (!line) return
      NUM_RE.lastIndex = 0
      let m
      while ((m = NUM_RE.exec(line)) !== null) {
        const digits = m[1]
        const unit = m[2] || ''
        if (!isSignificant(digits, unit)) { skippedSmall++; continue }
        const bare = clean(digits).replace(/,/g, '')
        if (numberInRef(bare, unit, refLoose, refDense)) {
          matchedCount++
        } else {
          const start = Math.max(0, m.index - 24)
          const snippet = line.slice(start, m.index + m[0].length + 24).trim()
          unmatched.push({ line: idx + 1, token: m[0].trim(), context: snippet })
        }
      }
    })
    refStats = { matched: matchedCount, skippedSmallNumbers: skippedSmall, unmatched }
  }

  const bannedHits = []
  const hedgingHits = []
  originalLines.forEach((line, idx) => {
    for (const word of BANNED) {
      if (line.includes(word)) bannedHits.push({ line: idx + 1, word, context: line.trim().slice(0, 80) })
    }
    for (const word of HEDGING) {
      if (line.includes(word)) hedgingHits.push({ line: idx + 1, word, context: line.trim().slice(0, 80) })
    }
  })

  const headingIssues = []
  let h1Count = 0
  let h2Count = 0
  let h3Count = 0
  let inQA = false
  let headingTotal = 0
  let inFence = false
  let prevHeading = null
  let sawBodySinceHeading = false
  const h2Junk = /^(其他|补充|杂项|附录)$/
  const h3Junk = /^(概述|浅谈|初探|其他|补充|小结|总结|背景介绍)$/
  const h3SentenceVerbRe = /(决定|导致|捕获|迫使|证明|揭示|带来|依赖|使得|取代|追平|反超|消除|清零)/

  let startLine = 0
  if (originalLines[0]?.trim() === '---') {
    let j = 1
    while (j < originalLines.length && originalLines[j].trim() !== '---') j++
    startLine = j + 1
  }

  for (let idx = startLine; idx < originalLines.length; idx++) {
    const line = originalLines[idx]
    if (/^```/.test(line.trim())) { inFence = !inFence; sawBodySinceHeading = true; continue }
    if (inFence) continue
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!h) {
      if (line.trim() && !/^---$/.test(line.trim())) sawBodySinceHeading = true
      continue
    }
    const level = h[1].length
    const title = h[2].trim()
    if (prevHeading && prevHeading.level < level && level <= 3 && !sawBodySinceHeading) {
      headingIssues.push({
        line: idx + 1,
        type: '父子标题间缺少引导段',
        detail: `${prevHeading.title} 与 ${title} 之间应先写 1–3 句引导段提出问题`,
      })
    }
    prevHeading = { level, title }
    sawBodySinceHeading = false
    if (/\b(?:RTX\s*\d{4}(?:\s*Ti|\s*SUPER)?|GTX\s*\d{4}|H100|H200|B100|B200|A100|A800|H800|L40S?|V100)\b/i.test(title)) {
      headingIssues.push({ line: idx + 1, type: '标题禁止出现具体显卡型号', detail: `${title}（请面向通用 GPU 读者命名，仅在实验环境或口径说明中写卡型）` })
    }
    if (level === 1) { h1Count++; continue }
    headingTotal++
    if (level === 2) { h2Count++; inQA = /答疑/.test(title) }
    if (level === 3) h3Count++
    if (level >= 5) headingIssues.push({ line: idx + 1, type: '层级过深', detail: title })
    if (/[？?]/.test(title) && !inQA) headingIssues.push({ line: idx + 1, type: '问句标题', detail: title })
    if (level === 2 && h2Junk.test(title)) headingIssues.push({ line: idx + 1, type: 'H2 空标题', detail: title })
    if (level === 3) {
      const cjkLen = (title.match(/[\u4e00-\u9fff]/g) || []).length
      const hasTerm = /[A-Za-z0-9]/.test(title)
      if (h3Junk.test(title)) {
        headingIssues.push({ line: idx + 1, type: 'H3 空标题（缺少关键术语）', detail: title })
      } else if (cjkLen > 18 || title.length > 44) {
        headingIssues.push({ line: idx + 1, type: 'H3 过长', detail: `${title}（建议精简为短名词短语，判断放正文断言句）` })
      } else if (!inQA && h3SentenceVerbRe.test(title) && (!hasTerm || cjkLen >= 10)) {
        headingIssues.push({ line: idx + 1, type: 'H3 偏复杂句式或缺少关键术语', detail: `${title}（建议改为短名词短语，如「算子融合原理」「典型算子融合方式」）` })
      }
    }
    if (level === 2 && title.length > 24) {
      headingIssues.push({ line: idx + 1, type: 'H2 过长', detail: `${title}（${title.length} 字，可能该降为 H3）` })
    }
  }
  if (h1Count !== 1) headingIssues.push({ line: 0, type: 'H1 数量', detail: `${h1Count} 个，必须恰好 1 个` })
  if (h2Count < 4 || h2Count > 8) headingIssues.push({ line: 0, type: 'H2 数量', detail: `${h2Count} 个，建议 4–8 个` })
  if (h3Count > 18) headingIssues.push({ line: 0, type: 'H3 数量', detail: `${h3Count} 个，建议不超过 18 个` })
  if (headingTotal > 30) headingIssues.push({ line: 0, type: '标题总数', detail: `${headingTotal} 个，建议不超过 30 个` })

  const metaphorWords = ['流水线', '大脑', '积木', '喂给', '串起来', '魔法', '黑盒']
  const metaphorHits = []
  originalLines.forEach((line, idx) => {
    for (const word of metaphorWords) {
      if (word === '流水线' && /指令流水线|流水线并行|流水线调度/.test(line)) continue
      if (line.includes(word)) metaphorHits.push({ line: idx + 1, word, context: line.trim().slice(0, 80) })
    }
  })

  const { derivationIssues, detailsIssues, detailsCount } = checkDerivationAndDetails(originalLines)
  const { imageIssues, imageCount, officialSourceImageCount } = checkImages(originalLines, dirname(resolve(reportPath)))
  const commandOutputIssues = checkCommandOutputAnalysis(originalLines)
  const hasPracticeH2 = originalLines.some((l) => /^##\s+.*实战/.test(l))

  const result = {
    report: reportPath,
    ref: refPath || null,
    refStats,
    bannedHits,
    hedgingHits,
    headingIssues,
    metaphorHits,
    derivationIssues,
    detailsIssues,
    detailsCount,
    imageIssues,
    imageCount,
    officialSourceImageCount,
    commandOutputIssues,
    hasPracticeH2,
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`教程: ${reportPath}`)
    if (refStats) {
      console.log(`\n参考文本数字核对: ${refStats.matched} 个匹配，${refStats.unmatched.length} 个需确认（跳过 ${refStats.skippedSmallNumbers} 个单个位数）`)
      for (const u of refStats.unmatched) {
        console.log(`  L${u.line}  ${u.token}  | ${u.context}`)
      }
    }

    console.log(bannedHits.length ? '\n禁用口吻:' : '\n禁用口吻: 未发现')
    for (const b of bannedHits) console.log(`  L${b.line}  「${b.word}」  ${b.context}`)

    if (hedgingHits.length) {
      console.log('\n模糊兜底词提醒（确认是否应改为明确条件或边界）:')
      for (const h of hedgingHits) console.log(`  L${h.line}  「${h.word}」  ${h.context}`)
    }

    console.log(headingIssues.length ? '\n标题问题:' : '\n标题问题: 未发现')
    for (const h of headingIssues) console.log(`  ${h.line ? `L${h.line}  ` : ''}[${h.type}] ${h.detail}`)

    if (metaphorHits.length) {
      console.log('\n疑似比喻（确认是否在代替机制解释）:')
      for (const m of metaphorHits) console.log(`  L${m.line}  「${m.word}」  ${m.context}`)
    }

    console.log(`\n配图检查: 共 ${imageCount} 张图片/SVG（其中官网/一手来源真图 ${officialSourceImageCount} 张）`)
    if (imageIssues.length) {
      for (const im of imageIssues) console.log(`  ${im.line ? `L${im.line}  ` : ''}[${im.type}] ${im.detail}`)
    } else {
      console.log('配图检查: 通过')
    }

    console.log(`\n双层折叠结构: 共 ${detailsCount} 个 ::: details 折叠框`)
    if (detailsIssues.length) {
      for (const d of detailsIssues) console.log(`  ${d.line ? `L${d.line}  ` : ''}[${d.type}] ${d.detail}`)
    } else {
      console.log('折叠框检查: 通过')
    }

    console.log(derivationIssues.length ? '\n推导与排版问题:' : '\n推导排版检查（一步一换行）: 通过')
    for (const d of derivationIssues) console.log(`  L${d.line}  [${d.type}] ${d.detail}`)

    if (commandOutputIssues.length) {
      console.log('\n拓展命令/输出分析问题:')
      for (const c of commandOutputIssues) console.log(`  L${c.line}  [${c.type}] ${c.detail}`)
    } else {
      console.log('\n拓展命令/输出分析检查: 通过')
    }

    if (!hasPracticeH2) {
      console.log('\n实战章节提醒: 未检测到「实战」H2 板块（若非纯原理概述文章，请在小结前补齐入门动手实战章节）')
    }

    const cleanRun =
      (!refStats || refStats.unmatched.length === 0) &&
      bannedHits.length === 0 &&
      headingIssues.length === 0 &&
      metaphorHits.length === 0 &&
      derivationIssues.length === 0 &&
      detailsIssues.length === 0 &&
      imageIssues.length === 0 &&
      commandOutputIssues.length === 0
    console.log(`\n结果: ${cleanRun ? '通过筛查' : '需要检查上面列出的项'}`)
  }

  if (strict && (
    (refStats && refStats.unmatched.length) ||
    bannedHits.length ||
    headingIssues.length ||
    metaphorHits.length ||
    derivationIssues.length ||
    detailsIssues.length ||
    imageIssues.length ||
    commandOutputIssues.length
  )) {
    process.exit(1)
  }
}

main()
