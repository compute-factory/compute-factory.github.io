export const repository = 'https://github.com/compute-factory/compute-factory.github.io'
export const organization = 'https://github.com/compute-factory'
export const contactEmail = 'wsj040303@gmail.com'

export const siteNav = [
  { text: '首页', link: '/', activeMatch: '^/$' },
  { text: '主题教程', link: '/guide/', activeMatch: '^/guide/' },
  { text: '论文阅读', link: '/#papers' },
  { text: '推荐项目', link: '/#recommended-projects' },
]

export const homeFeatures = [
  {
    id: 'tutorials',
    number: '01',
    title: '主题教程',
    description: '按入门导读、编程前置、推理与服务、GPU 与算子、分布式训练组织教程，配合学习路线和动手实验逐步掌握 AI Infra。',
    link: { text: '进入主题教程', href: '/guide/' },
  },
  {
    id: 'papers',
    number: '02',
    title: '论文阅读',
    description: '围绕 AI Infra 论文的问题背景、核心方法和实验结果展开解析，整理阅读前置、关键图解及原文入口。',
    link: { text: '查看阅读资料', href: '/resources' },
  },
  {
    id: 'recommended-projects',
    number: '03',
    title: '推荐项目',
    description: '收录值得学习的开源项目，介绍项目用途、推荐理由和适合的学习阶段，提供官方仓库与上手资料。',
    link: { text: '查看推荐项目', href: '/resources#recommended' },
  },
]
