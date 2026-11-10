export interface LearningTopic {
  id: string
  title: string
  summary: string
  subtopics: string[]
  links: { text: string; href: string }[]
}

export const learningTopics: LearningTopic[] = [
  {
    id: 'orientation',
    title: '入门导读',
    summary: '从一次对话请求看懂大模型、推理引擎和服务的分工，再用一段 Python 估算模型权重占多少内存。',
    subtopics: ['大模型概览', 'AI Infra 概览', '模型基础知识', 'GPU 架构', '第一次实验'],
    links: [{ text: '第一张工单 · 估算模型权重大小', href: '/guide/first-lab' }],
  },
  {
    id: 'programming',
    title: '编程前置',
    summary: '遇到一个读不懂的语法，再回来补一小课。先从 Python 函数、装饰器、迭代器和环境管理开始。',
    subtopics: ['Python 语言基础', 'Python 工程规范', 'PyTorch 张量与自动微分', 'C++ 与编译工具链', '开发环境与工具链'],
    links: [{ text: 'Python 术语表 · 装饰器', href: 'https://docs.python.org/zh-cn/3/glossary.html#term-decorator' }],
  },
  {
    id: 'inference',
    title: '推理与服务',
    summary: '先看懂一个 token 是怎么生成的，再跑通推理服务并测量表现，最后研究缓存、调度和算子的优化。',
    subtopics: ['推理原理', '推理引擎与服务', '测量与定位', '缓存与调度优化', '计算与精度优化', '多卡推理', '生产运维'],
    links: [{ text: 'vLLM · 推理服务压测', href: 'https://docs.vllm.ai/en/stable/benchmarking/cli/' }],
  },
  {
    id: 'gpu-kernels',
    title: 'GPU 与算子',
    summary: '先学 GPU 执行和数据搬运的共通基础，再用 CUDA C++、Triton 和 CUTLASS 观察同一个算子的不同实现。',
    subtopics: ['GPU 共通基础', 'CUDA C++', 'Triton', 'CUTLASS：GEMM 与 Tensor Core', 'CuTe', 'CUTLASS 应用实践', '算子优化实践'],
    links: [
      { text: 'CUDA 编程模型', href: 'https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html' },
      { text: 'Triton 算子教程', href: 'https://triton-lang.org/main/getting-started/tutorials/index.html' },
    ],
  },
  {
    id: 'distributed-training',
    title: '分布式训练',
    summary: '从单卡训练循环出发，理解数据怎样分给多张卡、梯度怎样同步，以及更大的模型怎样拆分。',
    subtopics: ['单卡训练基础', '通信与拓扑', '数据并行与状态分片', '张量并行', '流水线与专家并行', '训练系统实践'],
    links: [{ text: 'PyTorch · 分布式数据并行入门', href: 'https://docs.pytorch.org/tutorials/intermediate/ddp_tutorial.html' }],
  },
]
