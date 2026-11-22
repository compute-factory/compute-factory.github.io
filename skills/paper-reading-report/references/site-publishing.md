# 站点发布

报告先在工作区写成 Markdown，证据核对通过后再进站点仓库。导航、主题和构建脚本属于另一类改动，不要在执行本技能时顺手改。

## 一、目录约定

```text
compute-factory.github.io/
├── docs/
│   ├── papers/
│   │   ├── index.md                       # 论文板块页，只挂 PapersOverview 组件
│   │   └── flash-attention.md             # 每篇报告一个文件
│   ├── public/images/papers/
│   │   └── flash-attention/
│   │       ├── fig1-memory-hierarchy-tiling.png
│   │       └── fig2-io-and-runtime.png
│   └── public/papers/files/
│       └── flash-attention.pdf            # 下载副本，PDF 提交进仓库
```

- 文件名用英文短横线，和 URL 一致。中文标题只出现在 frontmatter 和正文标题里。
- 图片放 `docs/public/images/papers/<slug>/`，正文用 `/images/papers/<slug>/fig2-io-and-runtime.png` 引用。不要用相对路径，也不要用本机绝对路径。
- 图片命名说明内容，不要用 `image1.png`。

## 二、frontmatter

```yaml
---
title: FlashAttention：以分块与在线 Softmax 消除注意力矩阵的显存往返
description: 精读 Dao 等人的 FlashAttention 论文（arXiv:2205.14135v2），解析分块、在线 Softmax 换基与反向重算如何把精确注意力的显存占用压到线性并加速训练。
---
```

- `title` 用「对象 + 主题」的名词短语，不用问句；与正文唯一的一级标题一致。
- `description` 一句话说清读者读完能得到什么，会出现在搜索结果和列表页。

## 三、论文目录：`papers.ts`

板块页不再维护 Markdown 表格，而是在 `docs/.vitepress/content/papers.ts` 的 `papers` 数组里补一条：

```ts
{
  slug: 'flash-attention',
  title: 'FlashAttention：以分块与在线 Softmax 消除注意力矩阵的显存往返',
  citation: 'Dao et al. · FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness · NeurIPS 2022 (arXiv:2205.14135v2)',
  summary: '一句话说明这篇论文解决什么问题。',
  status: 'published',
  arxivId: '2205.14135v2',
  reportPdf: true,
  items: ['正文覆盖的核心小节一', '核心小节二'],
}
```

- `status` 改成 `published` 后，页面和站内收录才会放开。
- `arxivId` 写带版本号的 ID（如 `2205.14135v2`）；没有电子版就留空。
- `reportPdf` 与 `docs/public/papers/files/<slug>.pdf` 是否存在保持一致。
- `slug` 必须和 `docs/papers/<slug>.md` 的文件名一致。

## 四、下载副本

- Markdown 副本由构建前脚本 `scripts/sync-article-downloads.mjs` 从 `docs/papers/*.md` 生成，不要手工维护，也不要把生成的 `.md` 提交进仓库（已在 `.gitignore`）。
- PDF 用 `npm run articles:pdf` 调用本机 Chrome/Edge 无头打印生成，产物提交到 `docs/public/papers/files/<slug>.pdf`。
- 正文或打印样式改过之后，按 `npm run build && npm run articles:pdf && npm run build` 的顺序重跑，确认下载的 PDF 是最新版。

## 五、构建与验证

在仓库根目录：

```bash
npm run verify     # 大小写检查 + 构建，构建会检查站内死链
npm run preview    # 本地预览产物
```

必须贴出 `verify` 的真实输出，不能口头说「通过」。

冒烟检查：

- `/papers/` 返回 200
- 新报告页返回 200
- 报告里的图片能打开
- 站内没有 404

上线流程、PR 规范和回滚方式以仓库 `ops/RELEASE.md` 为准。提交信息用中文，只暂存自己改的文件，不要 `git add -A`。

## 六、不要做

- 不要把证据账本、聊天记录、草稿放进 `docs/`。VitePress 会把 `docs/` 下的 Markdown 全部构建成公开页面。
- 内部文档放 `ops/`，临时脚本放 `tmp/<日期>/`。
- 不要为了排版改主题组件或 `docs/.vitepress/` 下的配置，除非用户明确要求。论文报告用默认文档布局即可。
- 不要在报告里放只有本机能打开的图片路径。
