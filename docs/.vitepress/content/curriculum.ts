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
      summary: '它是什么、能做什么，Token 怎么切分，架构与精度如何影响显存，以及预训练、微调、推理三件事的边界。',
      status: 'published',
      items: ['大语言模型的定义与能力边界', 'Token 与 Tokenizer：文本切分与多语言编码差异', '模型架构与数值精度', '预训练、微调与推理的边界', '文本模型与多模态模型的差异'],
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
      summary: '用 CPU 加载一个小模型，估算参数大小，再测量加载耗时和进程内存。',
      status: 'published',
      items: ['环境准备与版本检查', '参数量到字节数的换算', '三种精度下的权重占用估算', '小模型加载与耗时记录', '结果校验与偏差排查', '实验记录整理'],
    },
  ],
  programming: [
    {
      slug: 'python-language',
      title: 'Python 语言基础',
      summary: '从一次模型调用读懂 Python 的参数传递、对象调用、装饰器、生成器与上下文管理器。',
      status: 'published',
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
      status: 'published',
      items: ['TTFT、TPOT、ITL 与端到端延迟', '吞吐、尾延迟与 Goodput', '并发度与输入输出长度的压测设计', '离线/在线接口差异与控制变量', 'nsys、PyTorch Profiler、ncu 与 CPU 采样', 'llama.cpp 慢推理定位与入门实测'],
    },
    {
      slug: 'cache-scheduling',
      title: '缓存与调度优化',
      summary: 'PagedAttention、连续批处理、前缀缓存，以及它们怎么组合。',
      status: 'planned',
      items: ['PagedAttention：KV Cache 的分页管理', 'Continuous Batching：连续批处理调度', 'Chunked Prefill：长请求的分块预填充', 'Prefix Caching：公共前缀的缓存复用', '各项优化的组合效果与取舍'],
    },
    {
      slug: 'quantization',
      title: '模型量化与精度评估',
      summary: '用比特数换显存与带宽，并验证量化后效果没有退化。',
      status: 'planned',
      items: ['量化的三个对象：权重、激活与 KV Cache', 'fp16、bf16、fp8 与 int8 的精度与开销对比', '主流量化方法：GPTQ、AWQ 与 SmoothQuant', '效果评估：困惑度与下游任务退化测试'],
    },
    {
      slug: 'execution-acceleration',
      title: '执行与解码加速',
      summary: '不改模型精度，靠算子融合、CUDA Graphs 与投机解码降低延迟。',
      status: 'published',
      items: ['Prefill 与 Decode 的算术强度对比', 'Kernel 启动开销与算子融合', 'CUDA Graphs 的 Capture、Replay 与推理应用', '投机解码的原理、典型技术与收益边界', 'RTX 5070 环境搭建与性能对比'],
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
  training: [
    {
      slug: 'single-gpu-training',
      title: '单卡训练与显存账本',
      summary: '把一次训练循环的计算和显存彻底算清楚，从 16N 与 18N 的显存构成开始。',
      status: 'planned',
      items: ['训练闭环：前向传播、损失计算、反向传播与优化器更新', '混合精度训练：FP32、FP16（Loss Scaling）与 BF16 的数值边界', '训练显存的四块构成：权重、梯度、优化器状态与激活值（16N / 18N 拆账）', '梯度累积与等效 Batch Size', '最小训练循环的峰值显存实测与理论值对照'],
    },
    {
      slug: 'training-profiling',
      title: '训练测量与瓶颈定位',
      summary: '和推理侧的测量对称，先建立「训练快不快、稳不稳」的量化标尺。',
      status: 'planned',
      items: ['Step Time、Token 吞吐与 MFU', 'PyTorch Profiler 与 Nsight Systems 时间线剖析', '三类瓶颈判别：算力受限、显存带宽受限与 CPU/IO 空泡', 'Loss Spike、Grad Norm 监控与梯度裁剪', '实测 MFU 与主要耗时热点定位'],
    },
    {
      slug: 'memory-optimization',
      title: '显存与激活值优化',
      summary: '不加卡，用算力、带宽和碎片整理把大模型和长序列塞进单卡。',
      status: 'planned',
      items: ['激活值随序列长度与层数的膨胀规律', '激活值重计算：用算力换显存的精确代价', '选择性重计算：重算哪些算子最划算', '优化器与参数卸载、PyTorch 显存碎片管理', '低显存优化器：8-bit Adam 与 Adafactor 的状态压缩思路', '三种重计算策略的峰值显存与单步耗时对比'],
    },
    {
      slug: 'compute-and-precision',
      title: '计算加速与低精度训练',
      summary: '算子融合、图编译与 FP8，训练框架怎样把硬件算力真正用起来。',
      status: 'planned',
      items: ['训练热点的算子融合：Fused AdamW 与 Fused CrossEntropy', 'FlashAttention 的前反向重计算', 'torch.compile 的工作原理与图断裂（Graph Break）', '动态形状带来的编译与重编译开销', 'FP8 混合精度训练：Scaling Factor、块级缩放与收益边界', '逐项开启后的单步耗时与 MFU 变化'],
    },
    {
      slug: 'data-and-checkpoint',
      title: '数据流水线与 Checkpoint 工程',
      summary: '补齐最容易忽略、却最常拖垮 GPU 利用率的两件事：喂数据和存状态。',
      status: 'planned',
      items: ['DataLoader 优化：多进程预取、pin_memory 与异步拷贝', 'Token Packing 消除变长 Padding 浪费', '流式数据集与大规模数据加载', '完整断点恢复：权重、优化器状态、LR 调度器与数据游标', '异步 Checkpoint 与 safetensors', 'Padding 与 Token Packing 的有效 Token 吞吐对比'],
    },
    {
      slug: 'post-training-systems',
      title: '微调与后训练系统实践',
      summary: '从 Infra 视角看 SFT、PEFT 与对齐阶段的系统负载，而不是调参技巧。',
      status: 'planned',
      items: ['全量 SFT、LoRA 与 QLoRA 的显存账本对比', '指令微调中的 Loss Masking 与长短样本混合负载', 'DPO 与 GRPO / PPO 的「推理采样 + 训练更新」混合执行特征', '单机后训练下的模型切换与显存复用', '全量微调与 QLoRA 的峰值显存上限对比'],
    },
  ],
  'distributed-parallel': [
    {
      slug: 'parallelism-overview',
      title: '分布式并行概览',
      summary: '先建立全局地图：为什么需要分布式并行、常见有哪些并行技术、训练与推理为什么诉求不同。',
      status: 'published',
      items: ['算力墙与显存墙：单卡为什么跑不动 70B', '五维并行全景：DP、TP、PP、CP/SP 与 EP', '多维并行的正交组合与通信底座', '训练与推理的并行诉求差异'],
    },
    {
      slug: 'communication-topology',
      title: '通信原语与硬件拓扑',
      summary: '多卡协同的物理与通信底座，把集合通信和数据搬运路径看懂、测准。',
      status: 'planned',
      items: ['Rank、World Size 与进程组（ProcessGroup）', '点对点与集合通信：AllReduce、AllGather、ReduceScatter 与 AllToAll', 'NCCL 工作机制与 Ring / Tree 通信路径', 'PCIe、NVLink、NVSwitch 与跨机 RDMA 网络', '实测单机多卡集合通信带宽（busbw）并与硬件峰值对照'],
    },
    {
      slug: 'data-parallel',
      title: '数据并行与状态分片',
      summary: '按样本或请求切分：训练里的状态分片，推理里的副本与 Attention DP。',
      status: 'planned',
      items: ['DDP 的梯度同步与通信-计算重叠', 'ZeRO-1/2/3 与 FSDP：从参数复制到分片重组', '推理中的 DP：多副本横向扩展与 Attention DP', '数据分片、随机种子对齐与通信量分析', 'DDP、ZeRO-2 与 ZeRO-3 的显存占用与吞吐差异'],
    },
    {
      slug: 'tensor-parallel',
      title: '张量与序列并行',
      summary: '层内切分，以及训练与推理在反向同步和前向延迟上的区别。',
      status: 'planned',
      items: ['层内切分原理：MLP 与 Attention 的列并行和行并行', '序列并行（SP）与上下文并行（CP / Ring Attention）', '通信量推导：TP 为什么强依赖高带宽 NVLink', '训练 TP 与推理 TP 的实现差异', '手写两卡 TP 线性层并验证前向输出与梯度一致性'],
    },
    {
      slug: 'pipeline-parallel',
      title: '流水线与专家并行',
      summary: '层间切分与 MoE 的专家切分，重点解决气泡和负载不均。',
      status: 'planned',
      items: ['层间切分与流水线气泡（Bubble）的产生', 'GPipe、1F1B 与交错调度（Interleaved 1F1B）', 'MoE 模型的专家并行（EP）与 AllToAll 通信瓶颈', '气泡比例与跨节点通信开销的理论估算', '不同微批次数下的流水线气泡与卡利用率测量'],
    },
    {
      slug: 'distributed-inference',
      title: '分布式推理实践',
      summary: '生产级多卡推理：TP、PP 与 EP 的适用边界，PD 分离与 MoE 部署。',
      status: 'planned',
      items: ['推理引擎的多卡并行架构：TP、PP 与 EP 的适用边界', 'Prefill 与 Decode 分离：架构原理、KV 传输与调度收益', '大规模 MoE 推理的典型组合：Attention DP + MoE EP', '多卡 TP/PP 部署下的 TTFT、TPOT 与吞吐拐点', 'PD 分离部署下长上下文并发时的首字与解码稳定性'],
    },
    {
      slug: 'distributed-training',
      title: '分布式训练实践',
      summary: '把多种并行组合起来跑真训练，补齐单维并行看不到的问题。',
      status: 'planned',
      items: ['混合并行的映射规则：TP 放节点内、PP/DP 跨节点', '重计算、梯度累积与通信重叠的配合', '分布式 Checkpoint（DCP）的分片保存与异构卡数恢复', 'MFU、扩展效率与常见瓶颈定位', 'FSDP + TP 混合并行下的扩展效率曲线与 loss 对齐'],
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
