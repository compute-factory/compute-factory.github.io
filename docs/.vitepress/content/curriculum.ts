export interface CurriculumModule {
  title: string
  items: string[]
}

// Keys match LearningTopic.id in learning.ts. Order is the suggested reading order.
export const curriculum: Record<string, CurriculumModule[]> = {
  orientation: [
    { title: '认识大模型', items: ['模型、参数与权重', 'Token 与 Tokenizer', '训练、微调与推理', '文本模型与多模态模型'] },
    { title: '认识 AI Infra', items: ['模型、推理引擎与 API 服务', '训练系统与推理系统', 'CPU、GPU、内存与显存', '从请求到生成结果的完整链路'] },
    { title: '最少需要的模型知识', items: ['向量、矩阵与张量形状', 'Embedding 与位置编码', 'Attention 与 Transformer', 'Logits、Softmax 与采样'] },
    { title: '第一次动手', items: ['准备 Python 环境', '估算模型权重大小', '加载一个小模型', '记录输入、输出和运行时间'] },
    { title: '选择学习路线', items: ['推理部署与服务路线', 'GPU 算子开发路线', '分布式训练路线', '阅读官方文档与记录实验'] },
  ],
  programming: [
    { title: 'Python 常用语法', items: ['函数、参数与作用域', '类、继承与特殊方法', '装饰器与闭包', '迭代器、生成器与上下文管理器'] },
    { title: 'Python 工程基础', items: ['模块、包与虚拟环境', '类型标注与 dataclass', '异常、日志与调试', '异步、线程与进程'] },
    { title: 'PyTorch 基础', items: ['Tensor 的 shape、dtype 与 device', '索引、广播与矩阵运算', 'Stride、view 与连续内存', '自动微分与 inference_mode'] },
    { title: 'C++ 与编译基础', items: ['指针、引用与内存生命周期', 'RAII 与智能指针', '模板与编译期参数', '编译、链接与 CMake'] },
    { title: '开发工具', items: ['Linux 命令与文件权限', 'Git 分支与 Pull Request', 'SSH、环境变量与 GPU 检查', 'Docker 与可复现实验环境'] },
  ],
  inference: [
    { title: '推理原理', items: ['自回归生成与采样策略', 'Prefill 与 Decode', 'KV Cache 的内容与容量', 'MHA、GQA 与 MQA'] },
    { title: '推理引擎与服务', items: ['模型加载与执行后端', '请求队列、调度器与执行器', '批处理与流式返回', 'vLLM 与 SGLang 入门'] },
    { title: '测量与定位', items: ['TTFT、TPOT 与端到端延迟', '请求吞吐与 Token 吞吐', '并发、输入输出长度与压测', 'Profiler、显存与时间线分析'] },
    { title: '缓存与调度优化', items: ['PagedAttention 与分页管理', 'Continuous Batching', 'Chunked Prefill', 'Prefix Caching 与缓存命中'] },
    { title: '计算与精度优化', items: ['权重、激活与 KV Cache 量化', '算子融合与 CUDA Graphs', '推测解码', '正确性、效果与性能对照'] },
    { title: '多卡与生产服务', items: ['张量并行与流水线并行推理', 'Prefill / Decode 分离', '负载均衡、超时与限流', '监控、故障恢复与版本管理'] },
  ],
  'gpu-kernels': [
    { title: 'GPU 共通基础', items: ['SM、Warp 与 SIMT', '寄存器、共享内存与全局内存', '访存合并、带宽与算术强度', '计时、同步与数值误差验证'] },
    { title: 'CUDA C++', items: ['Kernel 启动与线程索引', '向量加法与边界处理', 'Reduction 与共享内存', '分块矩阵乘、Stream 与异步拷贝'] },
    { title: 'Triton', items: ['Program、Block 与 Mask', '向量加法与 Fused Softmax', '矩阵乘与 Autotune', 'LayerNorm 与 Attention 算子'] },
    { title: 'CUTLASS / CuTe', items: ['GEMM 的层级与分块', 'Tensor Core 与 MMA', 'CuTe Layout 与 Tensor', 'CUTLASS 模板与 CuTe DSL'] },
    { title: '算子优化实践', items: ['建立 PyTorch 正确性基准', 'Roofline 与瓶颈判断', 'Nsight Systems 与 Nsight Compute', '融合、流水线与端到端收益'] },
  ],
  'distributed-training': [
    { title: '单卡训练基础', items: ['前向、反向与优化器', 'DataLoader 与数据预处理', '混合精度与梯度累积', '训练状态、显存估算与检查点'] },
    { title: '通信与拓扑', items: ['Rank、World Size 与进程组', 'AllReduce、AllGather 与 ReduceScatter', 'NCCL 与通信后端', 'PCIe、NVLink 与跨机网络'] },
    { title: '数据并行与状态分片', items: ['DDP 与梯度同步', 'ZeRO 的分片思路', 'FSDP 与参数重组', '数据分片与随机种子'] },
    { title: '模型并行', items: ['张量并行 TP', '流水线并行 PP 与气泡', '序列并行与上下文并行', 'MoE 与专家并行 EP'] },
    { title: '训练系统实践', items: ['从单机多卡到多机多卡', '重计算与通信计算重叠', '分布式检查点与恢复', '吞吐、扩展效率与故障定位'] },
  ],
}
