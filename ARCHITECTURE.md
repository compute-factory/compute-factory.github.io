# 代码架构与修改指南

本站使用 VitePress 1.6.4、Vue 3、TypeScript 和 Markdown，发布到 GitHub Pages。默认主题负责全站导航、搜索、文档侧栏、移动菜单和深浅色切换。首页和教学总览使用自定义 Vue 组件。

## 页面入口

| 路径 | 源文件 | 职责 |
| --- | --- | --- |
| / | docs/index.md | 组合首页首屏和下方介绍 |
| /guide/ | docs/guide/index.md | 教学分组导航、知识图和章节入口 |
| /guide/first-lab.html | docs/guide/first-lab.md | Markdown 实验正文 |
| /resources.html | docs/resources.md | 阅读资料与推荐项目 |

首页的论文阅读和推荐项目导航链接到首页对应锚点。首页底部展示联系邮箱和组织 GitHub 页面，联系方式集中配置在 content/site.ts。

## 文件职责

| 文件或目录 | 修改场景 |
| --- | --- |
| docs/.vitepress/config.mts | VitePress 配置、文档侧栏、搜索与页面元信息 |
| docs/.vitepress/content/site.ts | 顶部导航、首页板块文案、仓库地址 |
| docs/.vitepress/content/learning.ts | 教学方向、稳定锚点、知识点和阅读入口 |
| docs/.vitepress/theme/index.ts | 主题注册与全局 CSS 入口 |
| docs/.vitepress/theme/WorksiteLayout.vue | 扩展默认布局的导航插槽 |
| docs/.vitepress/theme/worksite.css | 全站颜色、字体、页面宽度与通用按钮 |
| docs/.vitepress/theme/components/RepositoryLink.vue | 桌面和手机共用的 GitHub 按钮 |
| docs/.vitepress/theme/components/home/HomeHero.vue | Logo、站名、介绍和开始学习按钮 |
| docs/.vitepress/theme/components/home/HomeSections.vue | 首页内容介绍和联系方式 |
| docs/.vitepress/theme/components/learning/LearningOverview.vue | 教学页导航、标题和地图容器 |
| docs/.vitepress/theme/components/learning/KnowledgeMap.vue | 可点击知识图及窄屏排列 |
| docs/public/logo.png | 站点标志 |
| .github/workflows/pages.yml | PR 构建检查与 main 自动发布 |

## 数据和样式约定

教学页顶部导航、知识图和文档侧栏使用同一份 learningTopics。地图目前展示五个一级分支。顶部导航定位地图节点，节点点击进入该方向 links 中的第一个阅读入口。新增方向时，在 learning.ts 中增加一项，使用唯一且稳定的 id，并提供至少一个有效 links 条目。知识图线条按方向数量计算，移动端转换为纵向分支。

首页与教学页使用流式全宽布局，外边距由 --cf-page-gutter 控制。全站导航宽度通过 --vp-layout-max-width 跟随视口。地图高度由视口高度和最低可读高度共同决定。后续扩展子分支时应继续使用结构化数据驱动地图。

阅读链接指向已有课程、章节锚点或官方资料。新增站内文章后，将对应 links 改为实际路径。内部链接通过 VitePress 的 withBase 处理。修改 id 时同步检查已有外链和锚点。

页面排版使用组件内的 scoped CSS。全站颜色、字体和间距基准放在 worksite.css，颜色通过 --cf-* 变量访问，并为深色模式提供对应值。Inter 使用 VitePress 自带字体；中文和等宽字体使用系统字体回退。

首页与教学总览使用 layout: page，普通文章继续使用默认文档布局。新增页面应明确属于哪种布局，避免将文章排版规则覆盖到自定义页面。

## 本地开发和验证

使用 Node.js 24，执行 npm ci 安装锁定依赖，npm run dev 启动开发预览。修改后执行 npm run build，再用 npm run preview 检查构建结果。

布局改动至少检查桌面、2560px 大屏和 375px 手机宽度，并检查 320px 窄屏、浏览器缩放、导航折叠、开始学习按钮、知识图全部节点、搜索和现有实验页。顶部专题导航应定位对应节点，节点链接应能进入阅读入口，页面应无横向溢出。深色主题也要检查文字和背景对比。

提交到 main 会触发发布。确认 GitHub Actions 成功后，再打开线上首页和教学页验证。自定义域名由仓库 Pages 设置管理。

后续修改目录、数据来源、路由或构建方式时，在同一个提交中更新这份文档。
