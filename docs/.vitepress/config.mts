import { defineConfig } from 'vitepress'
import { findChapterByPath } from './content/curriculum'
import { organization, contactEmail, siteNav } from './content/site'

export default defineConfig({
  lang: 'zh-CN',
  title: '算力工地',
  description: '面向新手的中文 AI Infra 学习路线、动手实验与教程索引。',
  head: [['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }]],
  // 占位章节不收录，把 curriculum 里的 status 改成 published 就会自动放开
  transformHead({ pageData }) {
    const routePath = '/' + pageData.relativePath.replace(/(index)?\.md$/, '')
    const chapter = findChapterByPath(routePath)
    if (!chapter || chapter.status === 'published') return []
    return [['meta', { name: 'robots', content: 'noindex' }]]
  },
  // 公式用 $...$ / $$...$$，构建时渲染成 SVG，不需要额外的前端脚本
  markdown: { math: true },
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag) => ['mjx-container', 'mjx-assistive-mml'].includes(tag),
      },
    },
  },
  themeConfig: {
    logo: { src: '/logo.png', alt: '戴安全帽的芯片' },
    nav: siteNav,
    // 不设侧栏：板块切换靠常驻的板块横条，文章内部导航靠左侧的本页目录
    aside: 'left',
    search: { provider: 'local' },
    outline: { label: '本页目录', level: [2, 3] },
    returnToTopLabel: '回到顶部',
    darkModeSwitchLabel: '切换配色',
    footer: {
      message: `<a href="mailto:${contactEmail}">联系我们：${contactEmail}</a><a href="${organization}">GitHub：compute-factory</a>`,
      copyright: '算力工地 Compute Factory',
    },
  },
})
