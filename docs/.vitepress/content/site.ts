export const repository = 'https://github.com/compute-factory/compute-factory.github.io'
export const organization = 'https://github.com/compute-factory'
export const contactEmail = 'wsj040303@gmail.com'

export const siteNav = [
  { text: '首页', link: '/', activeMatch: '^/$' },
  { text: '教学', link: '/guide/', activeMatch: '^/guide/' },
  { text: '论文阅读', link: '/#papers' },
  { text: '推荐项目', link: '/#recommended-projects' },
]

export const homeFeatures = [
  {
    id: 'tutorials',
    number: '01',
    title: '跟着路线学',
    description: '从认识大模型和推理引擎起步，做一次权重估算，再去读懂推理服务、GPU 算子和多卡训练。',
    link: { text: '查看教学地图', href: '/guide/' },
  },
  {
    id: 'papers',
    number: '02',
    title: '读懂一篇论文',
    description: '先了解论文想解决的问题，再沿着图、公式和实验看它是怎么解决的。',
    link: { text: '查看阅读资料', href: '/resources' },
  },
  {
    id: 'recommended-projects',
    number: '03',
    title: '跑一个开源项目',
    description: '按学习目标找项目，从官方文档和最小示例开始，跑出一个自己能验证的结果。',
    link: { text: '查看推荐项目', href: '/resources#recommended' },
  },
]
