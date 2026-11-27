# 落盘与站点发布规范

教学文章可在本地草稿区或直接对准站点章节文件完成 Markdown 撰写、配图渲染核查与脚本校验；当合入站点仓库发布时，按以下目录与构建流程执行。

## 一、本地写作约定

1. **禁止在工作区根目录直接堆放零散文件**：新增草稿与图表应放入有含义的专题子目录，文件名采用可读的英文短横线命名（如 `<topic-slug>.md`）。
2. **配图路径规范**：
   - 在独立草稿目录写作时，可在文章同级建 `images/` 存放自绘 SVG 或核实后的官方原图，正文使用 `./images/<diagram-name>.svg` 引用；
   - 在站点 `docs/guide/<section>/<slug>.md` 内直接写作时，将配图存放在 `docs/public/images/<section>/<slug>/`，正文使用 `/images/<section>/<slug>/<diagram-name>.svg` 站点根路径引用。
   - 严禁在正文中使用本机绝对路径（如 `C:\...`、`E:\...`、`/Users/...` 或 `file://`）。
3. **无 AI 署名**：正文、注释与提交信息中不添加 AI 协助标注或 `Co-Authored-By`。

## 二、站点发布约定

当需要将教学文章合入站点仓库时，目录结构如下：

```text
compute-factory.github.io/
├── docs/
│   ├── guide/<section>/<slug>.md              # 对应教学板块文章
│   ├── public/images/<section>/<slug>/        # 配套 SVG 与图片资源
│   └── public/guide/files/<section>/<slug>.pdf # 文章可下载 PDF 副本
```

1. **frontmatter 格式**：
   ```yaml
   ---
   title: <核心主题>
   description: <一句话说明读者学完建立的心智模型与收益>
   ---
   ```
   `title` 与正文唯一的一级标题（`# ...`）以及 `docs/.vitepress/content/curriculum.ts` 中对应章节的 `title` 保持一致。
2. **更新课程配置与构建验证**：在 `docs/.vitepress/content/curriculum.ts` 中对齐章节 `title`、`summary`、`items` 与 `status` 后，在仓库根目录执行：
   ```bash
   npm run verify
   ```
   检查大小写、技能规范、排版变量、死链与构建输出；若文章需生成/更新 PDF 下载稿，按 `AGENTS.md` 要求执行：
   ```bash
   npm run build && npm run articles:pdf && npm run build
   ```

## 三、不要做

- 不要把过程查证笔记、临时试验脚本或草稿直接写进公开站点目录 `docs/`（VitePress 会把 `docs/` 下的所有 Markdown 构建为公开网页）。
- 不要在未接到指令时擅自修改站点主题组件或推送远程仓库。
