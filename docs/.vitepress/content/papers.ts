export type PaperStatus = 'planned' | 'writing' | 'published'

export interface Paper {
  /** URL 段名，英文短横线 */
  slug: string
  title: string
  /** 原论文标题与发表会议/年份 */
  citation: string
  /** 一句话说明这篇论文解决什么问题 */
  summary: string
  status: PaperStatus
  /** 正文涵盖的核心部分 */
  items: string[]
  /** 原文的 arXiv 版本号（含版本，如 2205.14135v2）；没有电子版的论文留空 */
  arxivId?: string
  /** 是否已生成精读报告的 PDF 副本（docs/public/papers/files/<slug>.pdf） */
  reportPdf?: boolean
}

export const papers: Paper[] = [
  {
    slug: 'flash-attention',
    title: 'FlashAttention：以分块与在线 Softmax 消除注意力矩阵的显存往返',
    citation: 'Dao et al. · FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness · NeurIPS 2022 (arXiv:2205.14135v2)',
    summary: '精读 FlashAttention 论文，解析分块、在线 Softmax 换基与反向重算如何把精确注意力的显存占用压到线性并加速训练。',
    status: 'published',
    arxivId: '2205.14135v2',
    reportPdf: true,
    items: [
      '算术强度与标准注意力的四次 HBM 往返瓶颈',
      '在线 Softmax 跨块换基与增量维护分母',
      'N=4 手算算例核对分块合并与全局精确解',
      '反向传播片上重算与 dO ⊙ O 跨块求和化简',
      '外层遍历 K/V 的 IO 复杂度分析与实验验证',
    ],
  },
]

export function paperHref(slug: string): string {
  return `/papers/${slug}.html`
}

/** 站内可下载的报告副本：md 由构建前脚本生成，pdf 由 npm run papers:pdf 生成后提交 */
export function paperReportHref(slug: string, ext: 'md' | 'pdf'): string {
  return `/papers/files/${slug}.${ext}`
}

/** 原文摘要页（arXiv abs） */
export function arxivAbsUrl(paper: Paper): string | undefined {
  return paper.arxivId ? `https://arxiv.org/abs/${paper.arxivId}` : undefined
}

/** 原文 PDF 直链，点开即由浏览器内置阅读器打开 */
export function arxivPdfUrl(paper: Paper): string | undefined {
  return paper.arxivId ? `https://arxiv.org/pdf/${paper.arxivId}` : undefined
}

export function findPaperByPath(path: string): Paper | undefined {
  const normalized = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '')
  const match = normalized.match(/^\/papers\/([^/]+)$/)
  if (!match) return undefined
  return papers.find((paper) => paper.slug === match[1])
}
