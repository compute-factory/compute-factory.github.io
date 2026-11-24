#!/usr/bin/env node
// 论文报告证据与排版校验：
// 1. 数字是否在论文原文中出现
// 2. 每节是否有锚点
// 3. 是否残留禁用口吻、违规标题、禁用比喻
// 4. 是否违反「一步一换行」（自然段内分号串联公式推导、单行长连等式）
// 5. 是否落实「主干 + ::: details 折叠框」双层结构且无容器嵌套错误
// 用法：node check-evidence.mjs <报告.md> <论文文本.txt> [--strict] [--json]

import { readFileSync } from 'node:fs'

const BANNED = [
  '本文提出', '本文认为', '本文将', '笔者',
  '我们可以看到', '不难发现', '值得注意的是',
  '综上所述', '总的来说', '众所周知',
  '希望对你有帮助', '如有疑问', '让我们',
  '具有重要的理论意义', '具有重要的实用价值',
]

// × 不当作单位：8×A100 先按 8 处理，单个数位会被跳过。
const UNIT_RE = '(?:%|GiB|GB|MB|KB|TB|TiB|GFLOPs|TFLOPs|FLOPs|ms|μs|us|ns|min|分钟|小时|天|倍)'
const NUM_RE = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNIT_RE})?`, 'gi')

function usage() {
  console.log(`用法: node check-evidence.mjs <报告.md> <论文文本.txt> [--strict] [--json]

  --strict   有未匹配数字、禁用词、标题/推导/折叠问题时以退出码 1 结束
  --json     输出 JSON，便于其他脚本消费

先转文本: pdftotext -layout paper.pdf paper.txt`)
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

// 去掉所有空白，用于宽松包含判断
function dense(s) {
  return clean(s).replace(/,/g, '').replace(/\s+/g, '').toLowerCase()
}

// 保留空白，用于带边界的数字匹配
function loose(s) {
  return clean(s).replace(/,/g, '').replace(/\s+/g, ' ').toLowerCase()
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 把不该参与数字校验的内容清空，同时保留行号。
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

    // 显式标记为推导或解释性构造的行，跳过数字校验
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

function numberInPaper(bare, unit, paperLoose, paperDense) {
  if (unit) {
    const withUnit = dense(bare + unit)
    if (paperDense.includes(withUnit)) return true
  }
  const re = new RegExp(`(?<![\\d.])${escapeRegExp(bare)}(?![\\d.])`)
  return re.test(paperLoose)
}

// 检查推导格式（一步一换行）与 ::: details 折叠框规范
function checkDerivationAndDetails(originalLines) {
  const derivationIssues = []
  const detailsIssues = []
  let detailsCount = 0
  let inFence = false
  let inMath = false
  let inDetails = false
  let detailsStartLine = 0

  for (let i = 0; i < originalLines.length; i++) {
    const raw = originalLines[i]
    const trimmed = raw.trim()

    if (/^```/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      if (/^(算法|Algorithm)\s*\d+/i.test(trimmed) || /∈\s*R\^|\browmax\(|\browsum\(|[A-Za-z]_[ij]\b/.test(trimmed)) {
        derivationIssues.push({
          line: i + 1,
          type: '伪代码代码块未渲染数学符号',
          detail: `${trimmed.slice(0, 68)}（严禁用 \`\`\`text 写算法伪代码，应改用 > 引用块 + $...$ MathJax 公式并放入 ::: details）`,
        })
      }
      continue
    }

    // 检查 ::: 容器与嵌套
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

    // 检查数学块内的单行长连等式
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
      // 在展示数学块中，去掉换行符、上下标（如 _{k=1}）、\text{...} 后，按 \qquad 切分独立公式，再统计单条连等式的等号个数
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

    // 检查多色字体噪音（禁用 <span style="color:...">）
    if (/<span\b[^>]*style\s*=\s*["'][^"']*color\s*:/i.test(trimmed)) {
      derivationIssues.push({
        line: i + 1,
        type: '禁止多色文字内联样式',
        detail: `${trimmed.slice(0, 68)}...（请改用单一暖底 <mark>...</mark> 突出最关键的 1–2 处结论）`,
      })
    }

    // 检查自然段内或单个列表项内用分号串联多步公式推导（先剥离 HTML 标签与实体中的分号）
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

    // 检查行内公式 $...$ 中是否塞入 3 个及以上连续变换等号的长连等式（排除逗号分隔的参数赋值如 N=1024, d=64）
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
        // 排除形如 Q_2 = Q_3 = Q_4 = [] 的纯变量连等初始化
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
    detailsIssues.push({ line: 0, type: '缺少折叠深读层', detail: '全文未使用 ::: details 折叠框收纳深度推导或完整伪代码' })
  }

  return { derivationIssues, detailsIssues, detailsCount }
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) usage()

  const strict = argv.includes('--strict')
  const asJson = argv.includes('--json')
  const files = argv.filter((a) => !a.startsWith('--'))
  if (files.length < 2) usage()

  const [reportPath, paperPath] = files
  const report = readFileSync(reportPath, 'utf8')
  const paper = readFileSync(paperPath, 'utf8')
  const paperLoose = loose(paper)
  const paperDense = dense(paper)

  const scanLines = stripForScan(report)
  const originalLines = report.split(/\r?\n/)

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
      if (numberInPaper(bare, unit, paperLoose, paperDense)) {
        matchedCount++
      } else {
        const start = Math.max(0, m.index - 24)
        const snippet = line.slice(start, m.index + m[0].length + 24).trim()
        unmatched.push({ line: idx + 1, token: m[0].trim(), context: snippet })
      }
    }
  })

  const bannedHits = []
  originalLines.forEach((line, idx) => {
    for (const word of BANNED) {
      if (line.includes(word)) bannedHits.push({ line: idx + 1, word, context: line.trim().slice(0, 80) })
    }
  })

  // 标题体检：分层分工、层级、问句、空标题、预算
  const headingIssues = []
  let h2Count = 0
  let h3Count = 0
  let h4Count = 0
  let h4UnderCurrentH3 = 0
  let hasH3Parent = false
  let inQA = false
  let headingTotal = 0
  const h2Junk = /^(其他|补充|杂项|附录)$/
  const h3Junk = /^(概述|浅谈|初探|其他|补充|小结|简介|总结|背景介绍|实验设置|实验结果|方法介绍|结果分析)$/
  // 带 H4 子标题的 H3 是分组层，允许用短的分组名；叶子 H3 才必须写成判断句。
  const h3WithH4 = new Set()
  let openH3 = 0
  originalLines.forEach((line, idx) => {
    const h = /^(#{1,6})\s+/.exec(line)
    if (!h) return
    const level = h[1].length
    if (level === 3) openH3 = idx + 1
    else if (level <= 2) openH3 = 0
    else if (level === 4 && openH3) h3WithH4.add(openH3)
  })
  originalLines.forEach((line, idx) => {
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!h) return
    const level = h[1].length
    const title = h[2].trim()
    if (level === 1) return
    headingTotal++
    if (level === 2) {
      h2Count++
      inQA = /答疑/.test(title)
      hasH3Parent = false
      h4UnderCurrentH3 = 0
    }
    if (level === 3) {
      h3Count++
      hasH3Parent = true
      h4UnderCurrentH3 = 0
    }
    if (level === 4) {
      h4Count++
      if (!hasH3Parent) {
        headingIssues.push({ line: idx + 1, type: 'H4 缺少 H3 父级', detail: title })
      } else {
        h4UnderCurrentH3++
        if (h4UnderCurrentH3 > 4) {
          headingIssues.push({ line: idx + 1, type: 'H4 数量', detail: `${title}（同一 H3 下超过 4 个）` })
        }
      }
    }
    if (level >= 5) headingIssues.push({ line: idx + 1, type: '层级过深', detail: title })
    if (/[？?]/.test(title) && !inQA) headingIssues.push({ line: idx + 1, type: '问句标题', detail: title })
    const isGroupH3 = h3WithH4.has(idx + 1)
    if (level === 2 && h2Junk.test(title)) headingIssues.push({ line: idx + 1, type: 'H2 空标题', detail: title })
    if (level === 3 && !isGroupH3 && h3Junk.test(title)) {
      headingIssues.push({ line: idx + 1, type: 'H3 无判断', detail: title })
    } else if (level === 3 && !isGroupH3 && title.replace(/[\s\w]/g, '').length <= 5 && !/[？?]/.test(title)) {
      headingIssues.push({ line: idx + 1, type: 'H3 过短', detail: `${title}（可能只是话题标签，确认能否写成陈述句）` })
    }
    if (level === 4 && h3Junk.test(title)) {
      headingIssues.push({ line: idx + 1, type: 'H4 无判断', detail: title })
    } else if (level === 4 && title.replace(/[\s\w]/g, '').length <= 4 && !/[？?]/.test(title)) {
      headingIssues.push({ line: idx + 1, type: 'H4 过短', detail: `${title}（可能只是话题标签，确认能否写成判断句）` })
    }
    if (level === 2 && title.length > 24) {
      headingIssues.push({ line: idx + 1, type: 'H2 过长', detail: `${title}（${title.length} 字，可能该降为 H3）` })
    }
  })
  if (h2Count < 4 || h2Count > 8) {
    headingIssues.push({ line: 0, type: 'H2 数量', detail: `${h2Count} 个，建议 4–8 个` })
  }
  if (h3Count > 12) {
    headingIssues.push({ line: 0, type: 'H3 数量', detail: `${h3Count} 个，建议不超过 12 个` })
  }
  if (h4Count > 12) {
    headingIssues.push({ line: 0, type: 'H4 数量', detail: `${h4Count} 个，建议不超过 12 个` })
  }
  if (headingTotal > 24) {
    headingIssues.push({ line: 0, type: '标题总数', detail: `${headingTotal} 个，建议不超过 24 个` })
  }

  // 比喻词：这些词通常意味着在用比喻代替机制
  const metaphorWords = ['流水线', '大脑', '积木', '喂给', '串起来', '魔法', '黑盒']
  const metaphorHits = []
  originalLines.forEach((line, idx) => {
    for (const word of metaphorWords) {
      if (line.includes(word)) metaphorHits.push({ line: idx + 1, word, context: line.trim().slice(0, 80) })
    }
  })

  // 锚点覆盖：H2 统计范围包含其下的 H3/H4（延伸阅读章节除外）
  const headings = []
  originalLines.forEach((line, idx) => {
    const h = /^(#{2,4})\s+(.*)$/.exec(line)
    if (h) headings.push({ level: h[1].length, title: h[2].trim(), line: idx + 1 })
  })
  const sections = headings.map((h, i) => {
    let end = originalLines.length
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) { end = headings[j].line - 1; break }
    }
    const body = originalLines.slice(h.line, end).join('\n')
    return { ...h, anchors: (body.match(/\[论文[，,]/g) || []).length }
  })
  const noAnchorSections = sections.filter((s) => s.anchors === 0 && !/延伸阅读/.test(s.title))

  const totalAnchors = (report.match(/\[论文[，,]/g) || []).length
  const pageLinks = (report.match(/#page=\d+/g) || []).length

  const { derivationIssues, detailsIssues, detailsCount } = checkDerivationAndDetails(originalLines)

  const result = {
    report: reportPath,
    paper: paperPath,
    matched: matchedCount,
    skippedSmallNumbers: skippedSmall,
    unmatched,
    bannedHits,
    headingIssues,
    metaphorHits,
    derivationIssues,
    detailsIssues,
    detailsCount,
    anchors: { total: totalAnchors, pageLinks },
    sectionsWithoutAnchor: noAnchorSections,
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`报告: ${reportPath}`)
    console.log(`论文: ${paperPath}`)
    console.log(`\n数字: ${matchedCount} 个在论文中找到，${unmatched.length} 个需人工确认（跳过 ${skippedSmall} 个单个位数）`)
    if (unmatched.length) {
      console.log('\n需人工确认的数字（可能是推导、pdf 断行，或编造）:')
      for (const u of unmatched) {
        console.log(`  L${u.line}  ${u.token}`)
        console.log(`        ${u.context}`)
      }
      console.log('\n确认是推导得来的，在那一行末尾加 <!-- derived -->；确认是错的，回论文改。')
    }

    console.log(`\n锚点: ${totalAnchors} 处 [论文，...]；全文带 #page= 的链接 ${pageLinks} 处`)
    if (noAnchorSections.length) {
      console.log('\n以下小节没有锚点:')
      for (const s of noAnchorSections) console.log(`  L${s.line}  ${'#'.repeat(s.level)} ${s.title}`)
    }

    if (bannedHits.length) {
      console.log('\n禁用口吻:')
      for (const b of bannedHits) console.log(`  L${b.line}  「${b.word}」  ${b.context}`)
    } else {
      console.log('\n禁用口吻: 未发现')
    }

    if (headingIssues.length) {
      console.log('\n标题问题:')
      for (const h of headingIssues) {
        console.log(`  ${h.line ? `L${h.line}  ` : ''}[${h.type}] ${h.detail}`)
      }
    } else {
      console.log('\n标题问题: 未发现')
    }

    if (metaphorHits.length) {
      console.log('\n疑似比喻（确认是否在代替机制解释）:')
      for (const m of metaphorHits) console.log(`  L${m.line}  「${m.word}」  ${m.context}`)
    }

    console.log(`\n双层折叠结构: 共 ${detailsCount} 个 ::: details 折叠框`)
    if (detailsIssues.length) {
      console.log('折叠框问题:')
      for (const d of detailsIssues) {
        console.log(`  ${d.line ? `L${d.line}  ` : ''}[${d.type}] ${d.detail}`)
      }
    } else {
      console.log('折叠框检查: 通过')
    }

    if (derivationIssues.length) {
      console.log('\n推导排版问题（违反一步一换行）:')
      for (const d of derivationIssues) {
        console.log(`  L${d.line}  [${d.type}] ${d.detail}`)
      }
    } else {
      console.log('\n推导排版检查（一步一换行）: 通过')
    }

    const cleanRun =
      unmatched.length === 0 && bannedHits.length === 0 &&
      headingIssues.length === 0 && metaphorHits.length === 0 &&
      derivationIssues.length === 0 && detailsIssues.length === 0
    console.log(`\n结果: ${cleanRun ? '通过筛查' : '需要人工过一遍上面列出的项'}`)
    console.log('注意: 通过不等于没有幻觉，锚点仍要抽查。')
  }

  if (strict && (
    unmatched.length || bannedHits.length ||
    headingIssues.length || metaphorHits.length ||
    derivationIssues.length || detailsIssues.length
  )) {
    process.exit(1)
  }
}

main()
