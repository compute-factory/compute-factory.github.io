# 代码架构与修改指南

本站使用 VitePress 1.6.4、Vue 3、TypeScript 和 Markdown，发布到 GitHub Pages。默认主题负责全站导航、搜索、本页目录、移动菜单和深浅色切换。首页和教学总览使用自定义 Vue 组件。

## 页面入口

| 路径 | 源文件 | 职责 |
| --- | --- | --- |
| / | docs/index.md | 组合首页首屏和下方介绍 |
| /guide/ | docs/guide/index.md | 教学分组导航、知识图和板块入口 |
| /guide/{方向}/ | docs/guide/{方向}/index.md | 板块页：页头、开始学习和章节目录 |
| /guide/{方向}/{章节}.html | docs/guide/{方向}/{章节}.md | 章节页，正文由 Markdown 写 |
| /guide/first-lab.html | docs/guide/first-lab.md | Markdown 实验正文 |
| /resources.html | docs/resources.md | 阅读资料与推荐项目 |

板块（一级标题）和章节（二级标题）都来自 curriculum.ts，页面文件只是一层壳。30 个章节页现在只在 frontmatter 里写标题和描述，正文位置放一个 `<ChapterPlaceholder />`，由它按路由从 curriculum 里取出计划小节渲染。写正文时删掉这一行，左侧本页目录就会按正文的二、三级标题生成。

首页的论文阅读和推荐项目导航链接到首页对应锚点。「如何开始」的三个入口为主题教程、论文阅读、推荐项目。联系方式集中配置在 content/site.ts，由 config.mts 注入默认主题页脚，和站点署名一起以小字显示。

## 文件职责

| 文件或目录 | 修改场景 |
| --- | --- |
| docs/.vitepress/config.mts | VitePress 配置、本页目录位置与层级、搜索与页面元信息 |
| docs/.vitepress/content/site.ts | 顶部导航、首页板块文案、仓库地址 |
| docs/.vitepress/content/learning.ts | 五个板块的 id 和标题 |
| docs/.vitepress/content/curriculum.ts | 章节的 slug、标题、简介、状态与计划小节，修改课程规划优先编辑这里 |
| docs/.vitepress/theme/index.ts | 主题注册与全局 CSS 入口 |
| docs/.vitepress/theme/WorksiteLayout.vue | 扩展默认布局的导航插槽 |
| docs/.vitepress/theme/worksite.css | 全站颜色、字体、页面宽度与通用按钮 |
| docs/.vitepress/theme/components/RepositoryLink.vue | 桌面和手机共用的 GitHub 按钮 |
| docs/.vitepress/theme/components/home/HomeHero.vue | Logo、站名、介绍和开始学习按钮 |
| docs/.vitepress/theme/components/home/HomeSections.vue | 「如何开始」标题及三个板块入口 |
| docs/.vitepress/theme/components/learning/LearningOverview.vue | 教学页导航、标题和地图容器 |
| docs/.vitepress/theme/components/learning/KnowledgeMap.vue | 可点击知识图及窄屏排列 |
| docs/.vitepress/theme/components/learning/TopicOverview.vue | 板块页：板块标题和章节目录 |
| docs/.vitepress/theme/components/learning/TopicBar.vue | 主题教程下所有页面常驻的板块横条，让位偏移见 worksite.css 的「主题教程板块横条」 |
| docs/.vitepress/theme/components/learning/ChapterPlaceholder.vue | 章节占位页：按路由认领章节，只列标题和计划小节 |
| docs/public/logo.png | 站点标志 |
| .github/workflows/pages.yml | PR 构建检查与 main 自动发布 |

## 数据和样式约定

板块横条和知识图使用同一份 learningTopics。读者页面只呈现思维导图上有的标题（方向、模块、知识点），不放简介、延伸资料和“在 GitHub 上编辑”之类入口。地图是从左到右的三级思维导图：五个一级方向 → 二级模块 → 三级知识点。二级模块和三级知识点从 curriculum.ts 读取并默认全部显示，不折叠。三级文字表达课程规划，

修改知识图时，找到 curriculum 中与 learning.ts 的 id 相同的键。调整数组顺序可调整学习顺序和上一篇/下一篇的顺序，修改 title 可改二级标题，修改 items 可增删三级知识点。新增一级方向时，同时增加 learningTopics 和 curriculum 的对应条目，并补一个 `docs/guide/{方向}/index.md` 板块页。同一分支内的模块标题应唯一。

章节的 slug 决定 URL，改了等于换地址，站内外链要一起改。新增章节时复制同目录任意一个 `.md`，改 frontmatter、slug 和 curriculum 条目，正文留空即可。status 取 planned、writing、published，`planned` 和 `writing` 的页面会由 config.mts 的 transformHead 加上 noindex，不会被搜索引擎收录。

站点不设文档侧栏：板块切换靠常驻的板块横条，文章页左侧只放本页目录（config.mts 的 `aside: 'left'`，收录二、三级标题）。章节页底部的上一篇/下一篇由 ChapterPager.vue 按 curriculum 顺序生成，可以跨板块，所以 curriculum 的顺序就是课程顺序。

连线全部由 CSS 伪元素绘制（KnowledgeMap.vue 顶部的 --km-line 与 --km-gap），随内容高度自动对齐，无需维护像素坐标，也不使用 SVG。桌面每个方向一个主节点，右侧一列二级模块，每个模块后接一组知识点。1100px 以下主节点移到模块上方，760px 以下整体纵向排列。

首页与教学页使用流式全宽布局，外边距由 --cf-page-gutter 控制。全站导航宽度通过 --vp-layout-max-width 跟随视口。地图高度随内容增长，后续扩展继续使用结构化数据驱动地图。

首页首屏是全宽布局中的独立区块。在 1440px 及以上视口下使用 70vw 并水平居中，小屏使用可用内容宽度。「开始学习」按钮的字号、内边距和高度随视口适配，相关规则位于 HomeHero.vue。

内部链接通过 VitePress 的 withBase 处理。修改 id 时同步检查已有外链和锚点。

页面排版使用组件内的 scoped CSS。全站颜色、字体和间距基准放在 worksite.css，颜色通过 --cf-* 变量访问，并为深色模式提供对应值。Inter 使用 VitePress 自带字体；中文和等宽字体使用系统字体回退。

首页与教学总览使用 layout: page，普通文章继续使用默认文档布局。新增页面应明确属于哪种布局，避免将文章排版规则覆盖到自定义页面。

桌面导航在 1101px 及以上采用居中展开的菜单和随视口放大的字号。样式集中在 worksite.css，通过默认主题类名覆盖布局；升级 VitePress 时需复核这些选择器。小屏继续使用默认折叠菜单。

## 本地开发和验证

使用 Node.js 24，执行 npm ci 安装锁定依赖，npm run dev 启动开发预览。修改后执行 npm run build，再用 npm run preview 检查构建结果。

布局改动至少检查桌面、2560px 大屏和 375px 手机宽度，并检查 320px 窄屏、浏览器缩放、导航折叠、开始学习按钮、知识图全部节点、搜索和现有实验页。顶部专题导航应定位对应节点，节点链接应能进入阅读入口，页面应无横向溢出。深色主题也要检查文字和背景对比。

提交到 main 会触发发布。确认 GitHub Actions 成功后，再打开线上首页和教学页验证。自定义域名由仓库 Pages 设置管理。

后续修改目录、数据来源、路由或构建方式时，在同一个提交中更新这份文档。
