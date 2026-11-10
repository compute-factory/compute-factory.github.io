export interface CurriculumModule {
  title: string
  items: string[]
}

// Keys match LearningTopic.id in learning.ts. Order is the suggested reading order.
export const curriculum: Record<string, CurriculumModule[]> = {
  orientation: [
    {
      title: '大模型概览',
      items: ['大语言模型的定义与能力边界', 'Token 与 Tokenizer：文本切分与多语言编码差异', '预训练、微调与推理的边界', '文本模型与多模态模型的差异'],
    },
    {
      title: 'AI Infra 概览',
      items: ['AI Infra 的定义与职责范围', '一次推理请求的完整链路', '模型、推理引擎与 API 服务的职责划分', '训练系统与推理系统的优化目标差异', 'CPU、内存、GPU 与显存的分工', '瓶颈集中于显存与带宽的原因'],
    },
    {
      title: '模型基础知识',
      items: ['向量、矩阵与张量形状', 'Embedding：token 到向量的映射', '位置编码：序列顺序信息的引入方式', 'Attention：Query、Key、Value 的作用', 'Transformer 的分层结构', 'Logits、Softmax 与采样策略'],
    },
    {
      title: 'GPU 架构',
      items: ['GPU 的组成：SM、显存与缓存', 'SM 与 Warp：线程的基本执行单位', 'SIMT 执行模型与分支发散代价', '存储层级：寄存器、共享内存与全局内存', '带宽与算力的双重上限'],
    },
    {
      title: '第一次实验',
      items: ['环境准备与版本检查', '参数量到字节数的换算', '三种精度下的权重占用估算', '小模型加载与耗时记录', '结果校验与偏差排查', '实验记录整理'],
    },
  ],
  programming: [
    {
      title: 'Python 语言基础',
      items: ['函数、参数与作用域', '类、继承与特殊方法', '装饰器与闭包', '迭代器、生成器与上下文管理器'],
    },
    {
      title: 'Python 工程规范',
      items: ['模块、包与虚拟环境', '类型标注与 dataclass', '异常、日志与调试', '异步、线程与进程'],
    },
    {
      title: 'PyTorch 张量与自动微分',
      items: ['Tensor 的 shape、dtype 与 device', '索引、广播与矩阵运算', 'stride、view 与连续内存', '自动微分与 inference_mode'],
    },
    {
      title: 'C++ 与编译工具链',
      items: ['指针、引用与内存生命周期', 'RAII 与智能指针', '模板与编译期参数', '编译、链接与 CMake'],
    },
    {
      title: '开发环境与工具链',
      items: ['Linux 命令与文件权限', 'Git 分支与 Pull Request', 'SSH、环境变量与 GPU 检查', 'Docker 与可复现实验环境'],
    },
  ],
  inference: [
    {
      title: '推理原理',
      items: ['自回归生成机制', '采样策略：temperature、top-k 与 top-p', 'Prefill 与 Decode 两阶段的划分', 'KV Cache 的组成与容量', 'MHA、GQA 与 MQA 的结构差异'],
    },
    {
      title: '推理引擎与服务',
      items: ['首次推理运行与结果核对', '推理引擎的核心职责', '模型加载与执行后端', '请求队列、调度器与执行器的协作', '批处理与流式输出的实现', '主流推理引擎的定位对比'],
    },
    {
      title: '测量与定位',
      items: ['TTFT、TPOT 与端到端延迟', '请求吞吐与 token 吞吐', '并发度与输入输出长度对性能的影响', '压测工具与测试方法', 'Profiler 与时间线分析'],
    },
    {
      title: '缓存与调度优化',
      items: ['PagedAttention：KV Cache 的分页管理', 'Continuous Batching：连续批处理调度', 'Chunked Prefill：长请求的分块预填充', 'Prefix Caching：公共前缀的缓存复用', '各项优化的组合效果与取舍'],
    },
    {
      title: '计算与精度优化',
      items: ['量化的三个对象：权重、激活与 KV Cache', 'fp16、bf16、fp8 与 int8 的精度与开销对比', '算子融合与 CUDA Graphs', '推测解码', '效果评估：吞吐之外的正确性指标'],
    },
    {
      title: '多卡推理',
      items: ['单卡容量不足时的拆分判断', '张量并行：层内切分', '流水线并行：层间切分', 'Prefill 与 Decode 分离部署', '通信开销的估算方法'],
    },
    {
      title: '生产运维',
      items: ['负载均衡与请求分发', '超时、重试与限流', '监控指标的选择', '故障恢复与灰度发布', '版本管理与模型热更新'],
    },
  ],
  'gpu-kernels': [
    {
      title: 'GPU 共通基础',
      items: ['SM、Warp 与 SIMT 执行模型', '寄存器、共享内存与全局内存', '访存合并与有效带宽', '算术强度与 Roofline 模型', '计时、同步与数值误差验证'],
    },
    {
      title: 'CUDA C++',
      items: ['Kernel 启动与线程索引', '向量加法与边界处理', 'Reduction 与共享内存', '分块矩阵乘的实现', 'Stream 与异步拷贝'],
    },
    {
      title: 'Triton',
      items: ['Program、Block 与 Mask', '向量加法与 Fused Softmax 实现', '矩阵乘与 Autotune', 'LayerNorm 与 Attention 算子', 'Triton 与 CUDA 的适用范围差异'],
    },
    {
      title: 'CUTLASS：GEMM 与 Tensor Core',
      items: ['GEMM 的层级：threadblock、warp 与 mma', '分块与数据搬运', 'Tensor Core 与 MMA 指令', 'fp16 GEMM 的完整数据流'],
    },
    {
      title: 'CuTe',
      items: ['Layout：形状与步长', 'Tensor：Layout 与数据的组合', '层次化坐标映射', '用 CuTe 描述 tile 的坐标映射'],
    },
    {
      title: 'CUTLASS 应用实践',
      items: ['模板参数的解读方法', '主循环与 epilogue', 'CuTe DSL 的写法', 'epilogue 的修改：加入 bias 与激活', '正确性验证与收益测量'],
    },
    {
      title: '算子优化实践',
      items: ['正确性基准的建立', 'Roofline 分析：带宽瓶颈与算力瓶颈的判别', 'Nsight Systems 的时间线分析', 'Nsight Compute 的单 kernel 分析', '算子融合、流水线与端到端收益'],
    },
  ],
  'distributed-training': [
    {
      title: '单卡训练基础',
      items: ['前向、反向与优化器', 'DataLoader 与数据预处理', '混合精度与梯度累积', '训练状态与显存占用构成', 'Checkpoint 与恢复'],
    },
    {
      title: '通信与拓扑',
      items: ['Rank、World Size 与进程组', 'AllReduce、AllGather 与 ReduceScatter', 'NCCL 与通信后端', 'PCIe、NVLink 与跨机网络', '带宽计算：busbw 与理论值对照'],
    },
    {
      title: '数据并行与状态分片',
      items: ['DDP 与梯度同步', 'ZeRO 的三个阶段', 'FSDP 与参数重组', '数据分片与随机种子', '显存占用对比：DDP、ZeRO-2 与 ZeRO-3', '三种配置下的显存与吞吐测量'],
    },
    {
      title: '张量并行',
      items: ['列并行与行并行', '层内切分位置的选择', '通信量与重叠', 'Megatron 的切分实现', '两卡 TP 训练与单卡 loss 曲线对比'],
    },
    {
      title: '流水线与专家并行',
      items: ['流水线切分与气泡开销', '1F1B 与交错调度', '序列并行与上下文并行', 'MoE 与专家并行', '气泡比例的计算', '气泡比例的实测与理论对照'],
    },
    {
      title: '训练系统实践',
      items: ['从单机多卡到多机多卡', '重计算与显存占用', '通信与计算重叠', '分布式 checkpoint', '吞吐、扩展效率与故障定位', '1/2/4 卡扩展效率曲线的测量'],
    },
  ],
}
