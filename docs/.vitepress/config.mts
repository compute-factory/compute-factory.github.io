import { defineConfig } from 'vitepress'

const repository = 'https://github.com/compute-factory/compute-factory.github.io'

export default defineConfig({
  lang: 'zh-CN',
  title: '算力工地',
  description: '面向新手的中文 AI Infra 学习路线、动手实验与教程索引。',
  head: [['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }]],
  themeConfig: {
    logo: { src: '/logo.png', alt: '戴安全帽的芯片' },
    nav: [
      { text: '学习路线', link: '/guide/' },
      { text: '动手实验', link: '/guide/first-lab' },
      { text: '资料架', link: '/resources' },
    ],
    sidebar: [
      {
        text: '新手开工',
        items: [
          { text: '学习路线', link: '/guide/' },
          { text: '第一张工单', link: '/guide/first-lab' },
        ],
      },
      { text: '延伸阅读', items: [{ text: '资料架', link: '/resources' }] },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: `${repository}/edit/main/docs/:path`, text: '在 GitHub 上编辑此页' },
    outline: { label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '课程目录',
    darkModeSwitchLabel: '切换配色',
    footer: { message: '前方施工 · 新手可进', copyright: '算力工地 · Compute Factory' },
  },
})
