export type PaperStatus = 'planned' | 'writing' | 'published'

export const paperCategories = ['模型架构', 'GPU 与算子', '存储与通信', '训练系统', '推理与服务', '量化与压缩'] as const
export type PaperCategory = (typeof paperCategories)[number]

export interface Paper {
  /** URL 段名，英文短横线 */
  slug: string
  title: string
  authors: [string, ...string[]]
  /** 会议或期刊及年份；尚未正式发表时填预印本平台。 */
  venue: string
  /** YYYY-MM-DD，以可查证的首次公开日期为准。 */
  firstPublished: string
  firstPublishedVia?: string
  categories: [PaperCategory, ...PaperCategory[]]
  /** 一句话说明这篇论文解决什么问题 */
  summary: string
  status: PaperStatus
  /** 原文的 arXiv 版本号（含版本，如 2205.14135v2）；没有电子版的论文留空 */
  arxivId?: string
  /** 是否已生成精读报告的 PDF 副本（docs/public/papers/files/<slug>.pdf） */
  reportPdf?: boolean
}

export const papers: Paper[] = [
  {
    slug: 'flash-attention',
    title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness',
    authors: ['Tri Dao', 'Daniel Y. Fu', 'Stefano Ermon', 'Atri Rudra', 'Christopher Ré'],
    venue: 'NeurIPS 2022',
    firstPublished: '2022-05-27',
    firstPublishedVia: 'arXiv',
    categories: ['GPU 与算子', '存储与通信'],
    summary: '用分块和在线 Softmax 降低注意力的显存读写量。',
    status: 'published',
    arxivId: '2205.14135v2',
    reportPdf: true,
  },
  {
    slug: 'llada',
    title: 'Large Language Diffusion Models',
    authors: [
      'Shen Nie',
      'Fengqi Zhu',
      'Zebin You',
      'Xiaolu Zhang',
      'Jingyang Ou',
      'Jun Hu',
      'Jun Zhou',
      'Yankai Lin',
      'Ji-Rong Wen',
      'Chongxuan Li',
    ],
    venue: 'NeurIPS 2025',
    firstPublished: '2025-02-14',
    firstPublishedVia: 'arXiv',
    categories: ['模型架构', '推理与服务'],
    summary: '用掩码扩散取代自回归，从头训练 8B 语言模型并追平同规模自回归基线。',
    status: 'published',
    arxivId: '2502.09992v3',
    reportPdf: true,
  },
  {
    slug: 'forge-kernel',
    title: 'ForgeKernel: Self-Evolving Kernels Catching and Surpassing Experts and Agents',
    authors: [
      'Yaojian Chen',
      'Dazhi Peng',
      'Yiyun Zheng',
      'Zhui Zhu',
      'Shengye Xiang',
      'Leshan Li',
      'Zhen Li',
      'Xianglong Deng',
      'Haojun Sun',
      'Qingfeng He',
      'Shangzhan Li',
      'Yifei Shen',
      'Lin Gan',
      'Yuxuan Li',
      'Xu Han',
      'Zhiyuan Liu',
    ],
    venue: 'arXiv preprint',
    firstPublished: '2026-11-03',
    firstPublishedVia: 'arXiv',
    categories: ['GPU 与算子'],
    summary: '把内核生成的架构规划与代码实现拆成两个智能体，用跨轮封存参考和硬件探针知识库实现持续自进化。',
    status: 'published',
    arxivId: '2611.04998v1',
    reportPdf: true,
  },
]

export function paperHref(slug: string): string {
  return `/papers/${slug}.html`
}

/** 站内可下载的报告副本：md 由构建前脚本生成，pdf 由 npm run papers:pdf 生成后提交 */
export function paperReportHref(slug: string, ext: 'md' | 'pdf'): string {
  return `/papers/files/${slug}.${ext}`
}

export function paperDownloadName(paper: Paper, ext: 'md' | 'pdf'): string {
  const name = paper.title.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim()
  return `${name || paper.slug}-精读报告.${ext}`
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
