// 板块与章节的对应关系在 curriculum.ts，这里只管板块本身的 id 和标题。
export interface LearningTopic {
  id: string
  title: string
}

export const learningTopics: LearningTopic[] = [
  { id: 'orientation', title: '入门导读' },
  { id: 'programming', title: '编程前置' },
  { id: 'inference', title: '推理与服务' },
  { id: 'gpu-kernels', title: 'GPU 与算子' },
  { id: 'distributed-training', title: '分布式训练' },
]
