# 给 agent 的项目规则

这个文件写给在本仓库里干活的 agent，也写给不熟悉站点结构的人。动手前先读这里的硬规则；细节再去 `ARCHITECTURE.md` 和 `CONTRIBUTING.md`。

## 内容

- 站点内容只放在 `docs/`。`docs/` 下的每个 Markdown 都会变成公开页面。
- 内部文档放 `ops/`，脚本放 `scripts/`，两者都不会被构建成页面。
- 新增文章后跑 `npm run build && npm run articles:pdf && npm run build`，PDF 要随内容一起提交。

## 技能

仓库里的 agent 技能放在 `skills/<name>/`，每个目录的入口是 `SKILL.md`，细则在 `references/`，脚本在 `scripts/`，模板在 `assets/`。索引见 `skills/README.md`。

做任务前先看一眼索引：如果任务正好是某个技能的用途，就先读该技能目录下的 `SKILL.md`，按它的流程走，而不是临场发挥。目前有：

- `skills/paper-reading-report/SKILL.md` —— 把论文、聊天记录与笔记整理成可发布的中文读后报告。遇到「论文精读」「读后报告」「把这篇论文写成文章」，或收到论文 PDF / arXiv 链接时先读它。

新增技能照 `skills/README.md` 的步骤做，`scripts/check-skills.mjs` 会校验目录名、frontmatter 与文件引用。

## 排版与字体

**全站字体栈与字号只在 `docs/.vitepress/theme/worksite.css` 的 `:root` 里定义，其他文件一律取变量。**

- 字体栈：`var(--vp-font-family-base)`（正文）、`var(--vp-font-family-mono)`（代码与编号）。不要写新的 `font-family` 列表。
- 字号：`var(--cf-font-h1)`、`--cf-font-h2`、`--cf-font-h3`、`--cf-font-h4`、`--cf-font-display`、`--cf-font-ui`、`--cf-font-ui-sm`、`--cf-font-caption`、`--cf-font-math-inline`，本页目录另有 `--cf-font-outline-1` 到 `--cf-font-outline-4`。需要新层级时先加 token，再使用。
- 标题最多到 H4；H1–H4 都会出现在本页目录，H5 及更深不收录。
- 颜色：`var(--cf-ink)`、`--cf-text`、`--cf-muted`、`--cf-surface`、`--cf-soft`、`--cf-warm`、`--cf-amber`、`--cf-gold`、`--cf-border`。不要写裸十六进制色值。
- 正文里不要用 `<span style="...">` 改字号、颜色或字重。强调用 `**加粗**` 或 `::: tip` 之类的容器。
- 行内公式字号由主题统一缩放到 `--cf-font-math-inline`（0.9em），不要单独调。
- 深色模式和打印稿都由 `worksite.css` 统一处理，组件里不要另写 `.dark` 分支或打印样式。

以上规则由 `scripts/check-typography.mjs` 自动检查，已接入 `npm run check`（CI 在 PR 上会跑）。修的时候看报错的行号，改回变量即可。

## 提交

- 只暂存自己改的文件，不用 `git add -A`。
- 提交前跑 `npm run verify`，把输出贴出来，不要口头声称通过。
- 不标注 AI 协助，不加 `Co-Authored-By`。
