import { learningTopics } from './learning.ts'

export type ChapterStatus = 'planned' | 'writing' | 'published'

export interface Chapter {
  /** URL 段名，英文短横线，改了就相当于换地址 */
  slug: string
  title: string
  /** 一句话说明这一篇解决什么，用在板块页和页面描述里 */
  summary: string
  status: ChapterStatus
  /** 计划覆盖的小节，正文写好后会变成二级标题 */
  items: string[]
}

export const curriculum: Record<string, Chapter[]> = {
  orientation: [
    {
      slug: 'llm-overview',
      title: '大模型概览',
      summary: '它是什么、能做什么，Token 怎么切分，以及预训练、微调、推理三件事的边界。',
      status: 'published',
      items: ['大语言模型的定义与能力边界', 'Token 与 Tokenizer：文本切分与多语言编码差异', '预训练、微调与推理的边界', '文本模型与多模态模型的差异'],
    },
    {
      slug: 'ai-infra-overview',
      title: 'AI Infra 概览',
      summary: '一次请求经过哪些系统，瓶颈为什么总落在显存和带宽上。',
      status: 'planned',
      items: ['AI Infra 的定义与职责范围', '一次推理请求的完整链路', '模型、推理引擎与 API 服务的职责划分', '训练系统与推理系统的优化目标差异', 'CPU、内存、GPU 与显存的分工', '瓶颈集中于显存与带宽的原因'],
    },
    {
      slug: 'model-basics',
      title: '模型基础知识',
      summary: '从张量形状到 Attention，够读懂一次推理的最小数学。',
      status: 'planned',
      items: ['向量、矩阵与张量形状', 'Embedding：token 到向量的映射', '位置编码：序列顺序信息的引入方式', 'Attention：Query、Key、Value 的作用', 'Transformer 的分层结构', 'Logits、Softmax 与采样策略'],
    },
    {
      slug: 'gpu-architecture',
      title: 'GPU 架构',
      summary: 'SM、Warp 与内存层级，后面所有算子优化的前提。',
      status: 'planned',
      items: ['GPU 的组成：SM、显存与缓存', 'SM 与 Warp：线程的基本执行单位', 'SIMT 执行模型与分支发散代价', '存储层级：寄存器、共享内存与全局内存', '带宽与算力的双重上限'],
    },
    {
      slug: 'first-experiment',
      title: '第一次实验',
      summary: '把参数量换算成显存占用，加载一个小模型并记录跑出来的数字。',
      status: 'planned',
      items: ['环境准备与版本检查', '参数量到字节数的换算', '三种精度下的权重占用估算', '小模型加载与耗时记录', '结果校验与偏差排查', '实验记录整理'],
    },
  ],
  programming: [
    {
      slug: 'python-language',
      title: 'Python 语言基础',
      summary: '读 PyTorch 源码时绕不开的语法，从装饰器到生成器。',
      status: 'planned',
      items: ['函数、参数与作用域', '类、继承与特殊方法', '装饰器与闭包', '迭代器、生成器与上下文管理器'],
    },
    {
      slug: 'python-engineering',
      title: 'Python 工程规范',
      summary: '模块、类型标注、日志与并发，把脚本写成能维护的工程。',
      status: 'planned',
      items: ['模块、包与虚拟环境', '类型标注与 dataclass', '异常、日志与调试', '异步、线程与进程'],
    },
    {
      slug: 'pytorch-autograd',
      title: 'PyTorch 张量与自动微分',
      summary: 'Tensor 的形状、内存布局，以及梯度是怎么算出来的。',
      status: 'planned',
      items: ['Tensor 的 shape、dtype 与 device', '索引、广播与矩阵运算', 'stride、view 与连续内存', '自动微分与 inference_mode'],
    },
    {
      slug: 'cpp-toolchain',
      title: 'C++ 与编译工具链',
      summary: '指针、RAII、模板与 CMake，为读 CUDA 和 CUTLASS 做准备。',
      status: 'planned',
      items: ['指针、引用与内存生命周期', 'RAII 与智能指针', '模板与编译期参数', '编译、链接与 CMake'],
    },
    {
      slug: 'dev-environment',
      title: '开发环境与工具链',
      summary: 'Linux、Git、SSH 与 Docker，把实验环境做成可复现的。',
      status: 'planned',
      items: ['Linux 命令与文件权限', 'Git 分支与 Pull Request', 'SSH、环境变量与 GPU 检查', 'Docker 与可复现实验环境'],
    },
  ],
  inference: [
    {
      slug: 'inference-principles',
      title: '推理原理',
      summary: '一次生成里发生了什么：采样、两个阶段与 KV Cache 的结构。',
      status: 'planned',
      items: ['自回归生成机制', '采样策略：temperature、top-k 与 top-p', 'Prefill 与 Decode 两阶段的划分', 'KV Cache 的组成与容量', 'MHA、GQA 与 MQA 的结构差异'],
    },
    {
      slug: 'inference-engine',
      title: '推理引擎与服务',
      summary: '跑通第一个推理服务，再拆开队列、调度器和执行端的分工。',
      status: 'planned',
      items: ['首次推理运行与结果核对', '推理引擎的核心职责', '模型加载与执行后端', '请求队列、调度器与执行器的协作', '批处理与流式输出的实现', '主流推理引擎的定位对比'],
    },
    {
      slug: 'measurement',
      title: '测量与定位',
      summary: '用延迟、吞吐和 profiler 回答「现在慢在哪」。',
      status: 'planned',
      items: ['TTFT、TPOT 与端到端延迟', '请求吞吐与 token 吞吐', '并发度与输入输出长度对性能的影响', '压测工具与测试方法', 'Profiler 与时间线分析'],
    },
    {
      slug: 'cache-scheduling',
      title: '缓存与调度优化',
      summary: 'PagedAttention、连续批处理、前缀缓存，以及它们怎么组合。',
      status: 'planned',
      items: ['PagedAttention：KV Cache 的分页管理', 'Continuous Batching：连续批处理调度', 'Chunked Prefill：长请求的分块预填充', 'Prefix Caching：公共前缀的缓存复用', '各项优化的组合效果与取舍'],
    },
    {
      slug: 'compute-precision',
      title: '计算与精度优化',
      summary: '量化、算子融合、推测解码，以及怎么确认精度没坏。',
      status: 'planned',
      items: ['量化的三个对象：权重、激活与 KV Cache', 'fp16、bf16、fp8 与 int8 的精度与开销对比', '算子融合与 CUDA Graphs', '推测解码', '效果评估：吞吐之外的正确性指标'],
    },
    {
      slug: 'multi-gpu-inference',
      title: '多卡推理',
      summary: '单卡放不下时怎么切：张量并行、流水线并行与 PD 分离。',
      status: 'planned',
      items: ['单卡容量不足时的拆分判断', '张量并行：层内切分', '流水线并行：层间切分', 'Prefill 与 Decode 分离部署', '通信开销的估算方法'],
    },
    {
      slug: 'production-ops',
      title: '生产运维',
      summary: '负载均衡、限流、监控与灰度，把服务从能跑到能扛。',
      status: 'planned',
      items: ['负载均衡与请求分发', '超时、重试与限流', '监控指标的选择', '故障恢复与灰度发布', '版本管理与模型热更新'],
    },
  ],
  'gpu-kernels': [
    {
      slug: 'gpu-fundamentals',
      title: 'GPU 共通基础',
      summary: '动手写 kernel 之前要先建立的执行模型和访存直觉。',
      status: 'planned',
      items: ['SM、Warp 与 SIMT 执行模型', '寄存器、共享内存与全局内存', '访存合并与有效带宽', '算术强度与 Roofline 模型', '计时、同步与数值误差验证'],
    },
    {
      slug: 'cuda-cpp',
      title: 'CUDA C++',
      summary: '从向量加法到矩阵乘，用 CUDA C++ 把同一件事写四遍。',
      status: 'planned',
      items: ['Kernel 启动与线程索引', '向量加法与边界处理', 'Reduction 与共享内存', '分块矩阵乘的实现', 'Stream 与异步拷贝'],
    },
    {
      slug: 'triton',
      title: 'Triton',
      summary: '用 Python 写 kernel，和 CUDA 比一比适用范围。',
      status: 'planned',
      items: ['Program、Block 与 Mask', '向量加法与 Fused Softmax 实现', '矩阵乘与 Autotune', 'LayerNorm 与 Attention 算子', 'Triton 与 CUDA 的适用范围差异'],
    },
    {
      slug: 'cutlass-gemm',
      title: 'CUTLASS：GEMM 与 Tensor Core',
      summary: '拆开一个 GEMM，看 threadblock、warp 和 MMA 怎么咬合。',
      status: 'planned',
      items: ['GEMM 的层级：threadblock、warp 与 mma', '分块与数据搬运', 'Tensor Core 与 MMA 指令', 'fp16 GEMM 的完整数据流'],
    },
    {
      slug: 'cute',
      title: 'CuTe',
      summary: '用 Layout 与 Tensor 描述坐标映射，理解 CUTLASS 的抽象层。',
      status: 'planned',
      items: ['Layout：形状与步长', 'Tensor：Layout 与数据的组合', '层次化坐标映射', '用 CuTe 描述 tile 的坐标映射'],
    },
    {
      slug: 'cutlass-practice',
      title: 'CUTLASS 应用实践',
      summary: '改模板参数、改 epilogue，把一个现成的 kernel 用起来。',
      status: 'planned',
      items: ['模板参数的解读方法', '主循环与 epilogue', 'CuTe DSL 的写法', 'epilogue 的修改：加入 bias 与激活', '正确性验证与收益测量'],
    },
    {
      slug: 'kernel-optimization',
      title: '算子优化实践',
      summary: '先建正确性基准，再用 Roofline 和 Nsight 找瓶颈。',
      status: 'planned',
      items: ['正确性基准的建立', 'Roofline 分析：带宽瓶颈与算力瓶颈的判别', 'Nsight Systems 的时间线分析', 'Nsight Compute 的单 kernel 分析', '算子融合、流水线与端到端收益'],
    },
  ],
  'distributed-training': [
    {
      slug: 'single-gpu-training',
      title: '单卡训练基础',
      summary: '一次训练循环里有什么，显存又被谁占走了。',
      status: 'planned',
      items: ['前向、反向与优化器', 'DataLoader 与数据预处理', '混合精度与梯度累积', '训练状态与显存占用构成', 'Checkpoint 与恢复'],
    },
    {
      slug: 'communication-topology',
      title: '通信与拓扑',
      summary: 'AllReduce 一族、NCCL 与硬件拓扑，多卡训练的底座。',
      status: 'planned',
      items: ['Rank、World Size 与进程组', 'AllReduce、AllGather 与 ReduceScatter', 'NCCL 与通信后端', 'PCIe、NVLink 与跨机网络', '带宽计算：busbw 与理论值对照'],
    },
    {
      slug: 'data-parallel',
      title: '数据并行与状态分片',
      summary: 'DDP、ZeRO 与 FSDP，同一份数据怎么摊到多张卡上。',
      status: 'planned',
      items: ['DDP 与梯度同步', 'ZeRO 的三个阶段', 'FSDP 与参数重组', '数据分片与随机种子', '显存占用对比：DDP、ZeRO-2 与 ZeRO-3', '三种配置下的显存与吞吐测量'],
    },
    {
      slug: 'tensor-parallel',
      title: '张量并行',
      summary: '把一层拆到多卡：列并行、行并行与切分位置的选择。',
      status: 'planned',
      items: ['列并行与行并行', '层内切分位置的选择', '通信量与重叠', 'Megatron 的切分实现', '两卡 TP 训练与单卡 loss 曲线对比'],
    },
    {
      slug: 'pipeline-parallel',
      title: '流水线与专家并行',
      summary: '层间切分、1F1B 调度，以及 MoE 的专家并行。',
      status: 'planned',
      items: ['流水线切分与气泡开销', '1F1B 与交错调度', '序列并行与上下文并行', 'MoE 与专家并行', '气泡比例的计算', '气泡比例的实测与理论对照'],
    },
    {
      slug: 'training-systems',
      title: '训练系统实践',
      summary: '从单机到多机：重计算、通信重叠与 checkpoint。',
      status: 'planned',
      items: ['从单机多卡到多机多卡', '重计算与显存占用', '通信与计算重叠', '分布式 checkpoint', '吞吐、扩展效率与故障定位', '1/2/4 卡扩展效率曲线的测量'],
    },
  ],
}

export interface ChapterRef extends Chapter {
  topicId: string
  topicTitle: string
  /** 板块序号，从 1 开始 */
  topicIndex: number
  /** 章节在板块内的序号，从 1 开始 */
  number: number
}

/** 板块页地址，末位斜杠对应 index.md */
export function topicPath(topicId: string): string {
  return `/guide/${topicId}/`
}

/** 章节地址。VitePress 默认生成 .html，链接里要带上 */
export function chapterHref(topicId: string, slug: string): string {
  return `/guide/${topicId}/${slug}.html`
}

export function chaptersOf(topicId: string, topicTitle: string, topicIndex: number): ChapterRef[] {
  return (curriculum[topicId] ?? []).map((chapter, index) => ({
    ...chapter,
    topicId,
    topicTitle,
    topicIndex,
    number: index + 1,
  }))
}

/** 从路由路径（带或不带 .html）反查章节，供占位页自己认领 */
export function findChapterByPath(path: string): ChapterRef | undefined {
  const normalized = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '')
  const match = normalized.match(/^\/guide\/([^/]+)\/([^/]+)$/)
  if (!match) return undefined

  const [, topicId, slug] = match
  const index = learningTopics.findIndex((topic) => topic.id === topicId)
  if (index === -1) return undefined

  const { title } = learningTopics[index]
  return chaptersOf(topicId, title, index + 1).find((chapter) => chapter.slug === slug)
}
