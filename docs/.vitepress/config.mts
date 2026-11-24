import { h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { defineConfig } from 'vitepress'
import footnote from 'markdown-it-footnote'
import { findChapterByPath } from './content/curriculum'
import { findPaperByPath, paperCategories } from './content/papers'
import { organization, contactEmail, siteNav } from './content/site'

export default defineConfig({
  lang: 'zh-CN',
  title: '算力工地',
  description: '面向新手的中文 AI Infra 学习路线、动手实验与教程索引。',
  head: [['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }]],
  // 占位章节不收录，把 curriculum 或 papers 里的 status 改成 published 就会自动放开
  transformHead({ pageData }) {
    const routePath = '/' + pageData.relativePath.replace(/(index)?\.md$/, '')
    const paper = findPaperByPath(routePath)
    if (/^\/papers\/[^/]+$/.test(routePath) && (
      !paper?.categories?.length || !paper.categories.every(category => paperCategories.includes(category))
    )) {
      throw new Error(`${pageData.relativePath} 需要在 content/papers.ts 登记并选择至少一个固定分类`)
    }
    const entry = paper ?? findChapterByPath(routePath)
    if (!entry || entry.status === 'published') return []
    return [['meta', { name: 'robots', content: 'noindex' }]]
  },
  // 公式用 $...$ / $$...$$，构建时渲染成 SVG，不需要额外的前端脚本
  markdown: {
    lineNumbers: true,
    math: true,
    config(md) {
      // 长文里的名词解释用 [^注] 写在文末，正文只留编号
      md.use(footnote)
      // 只在渲染正文时插入图标，标题锚点、目录和下载稿继续使用原文。
      const open = md.renderer.rules.heading_open
      md.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
        const tag = open?.(tokens, index, options, env, renderer) ?? renderer.renderToken(tokens, index, options)
        const isArticle = /^(guide\/|papers\/|resources\.md$)/.test(env.relativePath ?? '')
        return tokens[index].tag === 'h1' && isArticle ? tag + '<SectionMark />' : tag
      }
    },
  },
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag) => ['mjx-container', 'mjx-assistive-mml'].includes(tag),
      },
    },
  },
  themeConfig: {
    logo: { src: '/logo.png', alt: '戴安全帽的芯片' },
    nav: await Promise.all(siteNav.map(async ({ icon, text, ...link }) => ({
      ...link,
      text: await renderToString(h('span', { class: 'cf-nav-label' }, [
        h(icon, { size: 17, 'stroke-width': 1.7, 'aria-hidden': 'true' }), text,
      ])),
    }))),
    // 不设侧栏：板块切换靠常驻的板块横条，文章内部导航靠左侧的本页目录
    aside: 'left',
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索站内内容' },
          modal: {
            displayDetails: '显示详细内容',
            resetButtonTitle: '清空搜索',
            backButtonTitle: '返回',
            noResultsText: '没有找到相关内容',
            footer: { selectText: '选择', navigateText: '切换结果', closeText: '关闭' },
          },
        },
      },
    },
    outline: { label: '本页目录', level: [1, 4] },
    returnToTopLabel: '回到顶部',
    darkModeSwitchLabel: '切换配色',
    footer: {
      message: `<a href="mailto:${contactEmail}">联系我们：${contactEmail}</a><a href="${organization}">GitHub：compute-factory</a>`,
      copyright: '算力工地 Compute Factory',
    },
  },
})
