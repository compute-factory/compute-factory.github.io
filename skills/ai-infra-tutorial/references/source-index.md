# 算力工地写作资料索引

核对日期为 2026-11-21。按算力工地的五个板块编排，章节名取自 [课程配置](https://github.com/compute-factory/compute-factory.github.io/blob/main/docs/.vitepress/content/curriculum.ts)。本索引供作者和写作模型按题查阅。站点面向读者的推荐入口见 [资料架](https://github.com/compute-factory/compute-factory.github.io/blob/main/docs/resources.md)。

## 怎么查

1. 用章节名或关键词定位下表，先读「先读」栏列出的具体章节。写作前记录要解释的机制、先修知识和能用一个小例子讲清的现象。
2. 用「核对」栏找原论文、官方文档或对应源码。涉及 CLI、API、默认值和源码调用链时，打开与文章所用版本一致的文档或仓库 tag。论文负责解释原始设计，框架文档和源码负责说明当前实现。
3. 用自己的例子、图和推导组织讲解，在对应段落附上实际读过的原始链接。复用文字、图或代码前查各项目的适用许可。实验记录写明硬件、软件版本、输入规模、基线和验证方法，区分预期结果与实测结果。

## 常用学习站点和课程

| 站点或课程 | 语言与类型 | 适合查什么 |
| --- | --- | --- |
| [AIInfraGuide](https://caomaolufei.github.io/AIInfraGuide/) | 中文教程 | 按前置知识、CUDA、推理、分布式训练分组。推理专题适合查 nano-vLLM、缓存与调度、量化和投机解码。 |
| [Datawhale × RadixArk · zero-to-sglang](https://github.com/datawhalechina/zero-to-sglang) · [中文版目录](https://github.com/datawhalechina/zero-to-sglang/blob/main/README_zh.md) | 中英双语课程 | Part I 建立推理与压测直觉，Part II 逐步实现小引擎，Part III 查注意力后端、低精度与 P/D 分离，Part IV 查部署和 profiling。 |
| [AI Infra Atlas](https://wushanchi.github.io/ai-infra-atlas/index.html) · [资源库](https://wushanchi.github.io/ai-infra-atlas/resources.html) | 中文资源地图 | 按硬件、算子、引擎、分布式和生产部署找下一层资源。顺着条目打开原始课程、论文或项目。 |
| [AIInfra 基础设施教程](https://infrasys-ai.github.io/aiinfra-docs/) | 中文教材 | 补集群架构、RDMA、集合通信、存储、容器和编排。目录标了 `DONE` 的小节可优先查正文。 |
| [OpenMLSys 中文第一版](https://openmlsys.github.io/v1/cn/index.html) · [英文第二版](https://openmlsys.github.io/) | 教材 | 建立「编程接口 → 计算图 → 编译与运行时 → 训练与推理」的系统视角，引用时注明所用版次。 |
| [AI Infra Handbook](https://ai-infra.cypggs.com/10-roadmap/learning-path) | 中文教程 | 补 Linux 性能、容器、Ray、KubeRay、KServe 和端侧推理，按学习路线跳到各专题。 |
| [AI Infra 系统学习库](https://wujhsu.github.io/ai-infra-learning-lab/) | 中文项目教程 | 看极小模型、训练恢复、推理服务和平台项目如何组织实验。首页列出了运行验证的范围。 |
| [WSJ 的 AI Infra 笔记](https://wsj040303.github.io/ai-infra/) | 中文专题笔记 | 从算力工地已有资料架继续查算子、推理框架和论文笔记，适合带关键词阅读。 |
| [BBuf · CUDA 与 AI Infra 优化笔记](https://github.com/BBuf/how-to-optim-algorithm-in-cuda) | 中文为主，笔记与实现 | Reduce、Softmax、GEMM、Attention、Triton、CUTLASS 和 CuTe。适合跟踪一次具体优化如何落到代码。 |
| [Stanford CS336 · Language Modeling from Scratch](https://cs336.stanford.edu/) | 英文课程与作业 | Tokenizer、Transformer、训练循环、算子、分布式策略和评估。作业适合参考实验拆分。 |
| [UC Berkeley · Scalable AI](https://scalable-ai.eecs.berkeley.edu/S2026/) | 英文课程与课件 | 贯通性能建模、并行、训练和推理系统。查 L2 性能模型、L18 高性能推理框架。 |
| [Machine Learning Systems](https://mlsysbook.ai/) | 英文教材与实验 | 框架、硬件加速、模型压缩、性能评估和部署的共通知识，适合查系统概览和术语。 |
| [How to Scale Your Model](https://jax-ml.github.io/scaling-book/) | 英文教材 | 手算 Roofline、Transformer 显存与计算量、训练通信和推理成本。计算方法可用于分析 GPU，示例的硬件假设主要围绕 TPU。 |
| [The Ultra-Scale Playbook](https://huggingface.co/spaces/nanotron/ultrascale-playbook/blob/main/ultra_blog.md) | 英文实战教材 | 对照单卡基线与 DP、TP、PP，查显存、通信与性能测量。此链接可直接读取正文。 |
| [Stas Bekman · Machine Learning Engineering](https://github.com/stas00/ml-engineering) | 英文工程手册 | 大模型训练的存储、网络、故障恢复和集群调度，适合查实机上的排查办法和运行经验。 |

## 按算力工地章节查资料

### 入门

| 章节 | 先读 | 核对 | 写作时查什么 |
| --- | --- | --- | --- |
| 大模型概览 | [Hugging Face LLM Course 中文](https://huggingface.co/learn/llm-course/zh-CN/chapter1/1) 第 1 章 | [CS336](https://cs336.stanford.edu/) Tokenization 讲次 | 用同一段文本展示 token 切分，再交代预训练、微调和推理分别发生在哪一步。 |
| AI Infra 概览 | [OpenMLSys 英文第二版](https://openmlsys.github.io/) 第 1、6、7 章 | [vLLM Architecture Overview](https://docs.vllm.ai/en/latest/design/arch_overview/) | 画一个生成请求经过 API、引擎、worker 和 GPU 的链路，交代训练和推理的优化目标。 |
| 模型基础知识 | [CS336 Assignment 1](https://github.com/stanford-cs336/assignment1-basics) | [Transformers 生成策略](https://huggingface.co/docs/transformers/en/generation_strategies) | 用小张量追踪 embedding、Q/K/V、logits 和采样，标明每一步的 shape。 |
| GPU 架构 | [zero-to-sglang 中文 Part I 第 3 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part1/第3章_GPU入门.md) | [CUDA Programming Model](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html) | SM、warp、SIMT、分支发散和存储层级。用同一个 kernel 例子串起来。 |
| 第一次实验 | [PyTorch Basics · Tensors](https://docs.pytorch.org/tutorials/beginner/basics/tensorqs_tutorial.html) | [Scaling Book · Transformer Inference](https://jax-ml.github.io/scaling-book/inference/) 的权重与缓存内存分析 | 先算参数量乘以每元素字节数，再测模型加载后的内存。说明精度、额外缓冲和框架开销带来的偏差。 |

### 工程基础

| 章节 | 先读 | 核对 | 写作时查什么 |
| --- | --- | --- | --- |
| Python 语言基础 | [Python 官方中文教程](https://docs.python.org/zh-cn/3/tutorial/) 的流程控制、类和迭代器 | [Python `contextlib`](https://docs.python.org/3/library/contextlib.html) | 选一个训练或推理脚本，结合代码讲生成器、装饰器、类的调用过程和资源释放。 |
| Python 工程规范 | [Python Packaging User Guide](https://packaging.python.org/en/latest/tutorials/packaging-projects/) | [Python 标准库](https://docs.python.org/3/library/) 的 `venv`、`logging` 和 `asyncio` | 用同一个最小项目串起包结构、虚拟环境、日志和异步请求。 |
| PyTorch 张量与自动微分 | [PyTorch Learn the Basics](https://docs.pytorch.org/tutorials/beginner/basics/intro.html) 的 Tensors 与 Autograd | [Tensor Views](https://docs.pytorch.org/docs/stable/tensor_view.html) · [`inference_mode`](https://docs.pytorch.org/docs/stable/generated/torch.autograd.grad_mode.inference_mode.html) | 给出 shape、stride 和 dtype 的对照例子，检查转置后是否共享存储，区分自动微分与推理执行。 |
| C++ 与编译工具链 | [CMake Tutorial](https://cmake.org/cmake/help/latest/guide/tutorial/index.html) | [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines) 的资源管理章节 | 用一个源文件、一个库和一个可执行程序说明编译、链接与 RAII。 |
| 开发环境与工具链 | [Pro Git 中文](https://git-scm.com/book/zh/v2) · [Docker 工具教程](https://docs.docker.com/learn/) | [CUDA Linux 安装指南](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/) · [CUDA on WSL](https://docs.nvidia.com/cuda/wsl-user-guide/index.html) | 核对驱动、Toolkit、Python 环境和容器里的 GPU 可见性，分别给出 Linux 或 WSL 的验证命令。 |

### 大模型推理

| 章节 | 先读 | 核对 | 写作时查什么 |
| --- | --- | --- | --- |
| 推理原理 | [zero-to-sglang Part I 第 2 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part1/第2章_推理入门.md) · [第 4 章 KV Cache](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part1/第4章_推理的核心数据结构入门.md) | [Scaling Book · Transformer Inference](https://jax-ml.github.io/scaling-book/inference/) · [Transformers 生成策略](https://huggingface.co/docs/transformers/en/generation_strategies) | 核算一个具体模型的 KV Cache，写明层数、KV 头数、head dimension、序列长度和 dtype。用 MHA/GQA/MQA 对比头数对容量的影响。 |
| 推理引擎与服务 | [zero-to-sglang Part II 第 2 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part2/第2章_一个请求的旅程.md) · [Inside vLLM](https://vllm-project.github.io/2025/09/05/anatomy-of-vllm.html) | [Mini-SGLang](https://github.com/sgl-project/mini-sglang) · [vLLM Quickstart](https://docs.vllm.ai/en/latest/getting_started/quickstart/) · [SGLang 官方文档](https://docs.sglang.io/) | 从流式请求追踪队列、调度、模型执行与返回。想快速看代码可从 [nano-vllm](https://github.com/GeeeekExplorer/nano-vllm) 的 engine 下手，正式框架按写作所用版本核对。 |
| 测量与定位 | [zero-to-sglang Part I 第 5 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part1/第5章_Benchmark入门.md) · [Part IV 第 2 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part4/第2章_Profiling与Trace分析.md) | [`vllm bench serve`](https://docs.vllm.ai/en/latest/cli/bench/serve/) · [GuideLLM](https://github.com/vllm-project/guidellm) | 查 TTFT、TPOT、ITL、请求与 token 吞吐、尾延迟和 goodput 的统计口径。压测要固定输入输出长度分布和负载模型。 |
| 缓存与调度优化 | [zero-to-sglang Part II 第 6 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part2/第6章_ContinuousBatching与调度.md) · [第 7 章分页 KV Cache](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part2/第7章_PagedKVCache与显存管理.md) · [第 8 章前缀缓存](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part2/第8章_RadixAttention与前缀缓存.md) | [Orca](https://www.usenix.org/conference/osdi22/presentation/yu) · [PagedAttention](https://arxiv.org/abs/2309.06180) · [SGLang](https://arxiv.org/abs/2312.07104) · [Sarathi-Serve](https://www.usenix.org/conference/osdi24/presentation/agrawal) · [vLLM 调度源码](https://github.com/vllm-project/vllm/blob/main/vllm/v1/core/sched/scheduler.py) · [vLLM Prefix Caching](https://docs.vllm.ai/en/latest/design/prefix_caching/) | 分别画请求如何进出 batch、KV block 如何分配、前缀如何命中。Chunked Prefill 对照 Sarathi-Serve 和 [vLLM 当前调优指南](https://docs.vllm.ai/en/latest/configuration/optimization/)，查 token budget 与调度规则。 |
| 模型量化与精度评估 | [zero-to-sglang Part III 第 2 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part3/第2章_量化与低精度推理.md) · [AIInfraGuide 推理优化第 4 章](https://caomaolufei.github.io/AIInfraGuide/inference/) | [Transformers 量化指南](https://huggingface.co/docs/transformers/main/en/quantization/overview) · [vLLM 量化支持](https://docs.vllm.ai/en/latest/features/quantization/) · [LM Evaluation Harness](https://github.com/EleutherAI/lm-evaluation-harness) | 讲清量化的是权重、激活还是 KV Cache。选同一模型和任务，对照显存、速度和评估分数，并核对 GPU 与内核支持。 |
| 执行与解码加速 | [zero-to-sglang Part II 第 10 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part2/第10章_投机解码.md) · [Part III 第 1 章注意力后端](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part3/第1章_注意力后端.md) | [CUDA Graphs](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/cuda-graphs.html) · [投机解码论文](https://arxiv.org/abs/2211.17192) · [vLLM 投机解码](https://docs.vllm.ai/en/latest/features/speculative_decoding/) | 分别说明算子融合、图重放和 draft/verify 节省的工作。用接受率、流量和延迟解释投机解码收益。 |
| 多卡推理 | [zero-to-sglang Part II 第 9 章](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part2/第9章_多进程与张量并行.md) · [Part III 第 5 章 P/D 分离](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part3/第5章_PrefillDecode分离.md) | [vLLM 并行与扩展](https://docs.vllm.ai/en/latest/serving/parallelism_scaling/) · [DistServe 论文](https://arxiv.org/abs/2401.09670) · [Dynamo P/D 分离](https://docs.nvidia.com/dynamo/latest/knowledge-base/concepts/system-architecture/disaggregated-serving) | 分别核算 TP、PP 与 P/D 分离的切分边界、通信量和 KV 传输代价，交代带宽和负载条件。 |
| 生产运维 | [llm-d 部署指南](https://github.com/llm-d/llm-d/blob/main/guides/README.md) | [vLLM Production Metrics](https://docs.vllm.ai/en/latest/usage/metrics/) · [KServe LLMInferenceService 灰度发布](https://kserve.github.io/website/docs/0.20/model-serving/generative-inference/llmisvc/canary-rollout) | 查队列、缓存命中、延迟指标和路由策略。把流量切分与回滚写成独立实验，核对安装版本是否支持对应能力。 |

### GPU 与算子

| 章节 | 先读 | 核对 | 写作时查什么 |
| --- | --- | --- | --- |
| GPU 共通基础 | [Stanford CS149 课表与课件](https://gfxcourses.stanford.edu/cs149/fall25) · [Scaling Book · Roofline](https://jax-ml.github.io/scaling-book/roofline/) | [CUDA Programming Model](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html) | 算术强度、访存合并、有效带宽、同步和计时，用同一个带宽受限算子建立直觉。 |
| CUDA C++ | [NVIDIA CUDA 入门](https://developer.nvidia.com/blog/even-easier-introduction-cuda) · [GPU MODE 讲义](https://github.com/gpu-mode/lectures) | [CUDA Writing SIMT Kernels](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/writing-cuda-kernels.html) · [CUDA Samples](https://github.com/NVIDIA/cuda-samples) | 从向量加法到 reduction、shared-memory tiling，再讲 stream。查同步点和边界条件。 |
| Triton | [Triton 官方教程](https://triton-lang.org/main/getting-started/tutorials/index.html) 的 Vector Addition、Fused Softmax、Matrix Multiplication | [Triton 教程源码](https://github.com/triton-lang/triton/tree/main/python/tutorials) | 从 program ID 和 mask 算索引，记录 tile、autotune 配置、正确性和性能的变化。 |
| CUTLASS：GEMM 与 Tensor Core | [CUDA Tensor Core GEMM 从零实现](https://alexarmbr.github.io/2024/08/10/How-To-Write-A-Fast-Matrix-Multiplication-From-Scratch-With-Tensor-Cores.html) · [BBuf CUTLASS 笔记](https://github.com/BBuf/how-to-optim-algorithm-in-cuda/tree/master/cutlass) | [CUTLASS Efficient GEMM](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/efficient_gemm.html) | 从 threadblock、warp 和 MMA 三级追踪取数、分块、累加和输出，标明目标架构。 |
| CuTe | [CuTe Quickstart](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/cute/00_quickstart.html) | [CuTe Layouts](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/cute/01_layout.html) | 先手算一组 shape/stride 的坐标映射，再对照 Layout、Tensor 和 tile 的实现。 |
| CUTLASS 应用实践 | [CUTLASS 仓库示例](https://github.com/NVIDIA/cutlass/tree/main/examples) · [CuTe DSL 快速入门](https://docs.nvidia.com/cutlass/latest/media/docs/pythonDSL/quick_start.html) | [CUTLASS 3.x GEMM API](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/gemm_api_3x.html) · [架构与功能支持](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/functionality.html) | 分别定位 mainloop 与 epilogue，给一个加 bias 的修改点和正确性对照，注明 CUTLASS 版本和架构。 |
| 算子优化实践 | [BBuf 算子目录](https://github.com/BBuf/how-to-optim-algorithm-in-cuda/tree/master/cuda-kernels) | [Nsight Systems](https://docs.nvidia.com/nsight-systems/UserGuide/index.html) · [Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html) | 先用时间线找 GPU 空档与 launch 开销，再用单 kernel 的数据解释瓶颈。写 Attention 时可查 [FlashAttention 原论文](https://arxiv.org/abs/2205.14135) 和 [FlashInfer 文档](https://docs.flashinfer.ai/)。 |

### 分布式训练

| 章节 | 先读 | 核对 | 写作时查什么 |
| --- | --- | --- | --- |
| 单卡训练基础 | [PyTorch Learn the Basics](https://docs.pytorch.org/tutorials/beginner/basics/intro.html) 的 DataLoaders、Optimization 和 Save and Load | [PyTorch AMP Recipe](https://docs.pytorch.org/tutorials/recipes/recipes/amp_recipe.html) · [CS336 Assignment 1](https://github.com/stanford-cs336/assignment1-basics) | 把参数、梯度、优化器状态和激活分开记账，给出一个可恢复训练的最小示例。 |
| 通信与拓扑 | [AIInfra 基础设施教程](https://infrasys-ai.github.io/aiinfra-docs/) 的「通信与存储」 | [NCCL Collectives](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html) · [nccl-tests](https://github.com/NVIDIA/nccl-tests) | 画出 AllReduce、AllGather、ReduceScatter 每个 rank 的输入输出。跑带宽实验时写清拓扑与 `algbw`、`busbw` 的口径。 |
| 数据并行与状态分片 | [AIInfraGuide 分布式训练目录](https://caomaolufei.github.io/AIInfraGuide/distributed/) · [The Ultra-Scale Playbook](https://huggingface.co/spaces/nanotron/ultrascale-playbook/blob/main/ultra_blog.md) | [PyTorch DDP](https://docs.pytorch.org/tutorials/beginner/ddp_series_theory.html) · [PyTorch FSDP2](https://docs.pytorch.org/tutorials/intermediate/FSDP_tutorial.html) · [DeepSpeed ZeRO](https://www.deepspeed.ai/tutorials/zero/) | 对照 DDP、ZeRO 各阶段和 FSDP2 的分片对象及通信时机。记录相同有效 batch size 下的显存峰值和吞吐。 |
| 张量并行 | [Scaling Book · Transformer Training](https://jax-ml.github.io/scaling-book/training/) | [PyTorch Tensor Parallel](https://docs.pytorch.org/tutorials/intermediate/TP_tutorial.html) · [Megatron Core 并行策略](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html) | 手推同一层线性变换的列切分、行切分、输出形状和集合通信，再对照一段实现。 |
| 流水线与专家并行 | [The Ultra-Scale Playbook](https://huggingface.co/spaces/nanotron/ultrascale-playbook/blob/main/ultra_blog.md) 的 PP 与 EP | [Megatron 流水线论文](https://arxiv.org/abs/2104.04473) · [Megatron Core 并行策略](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html) | 用微批时间线讲 1F1B、气泡和交错调度。用 token 路由图说明专家负载与 all-to-all。 |
| 训练系统实践 | [Machine Learning Engineering · Training](https://github.com/stas00/ml-engineering/tree/master/training) | [PyTorch Distributed Checkpoint](https://docs.pytorch.org/tutorials/recipes/distributed_checkpoint_recipe.html) · [PyTorch Distributed Overview](https://docs.pytorch.org/tutorials/beginner/dist_overview.html) | 查恢复、激活重计算、通信重叠和扩展效率。实验可对比 1/2/4 卡吞吐，并验证从保存点恢复。 |

### 相邻专题

| 专题 | 先读 | 核对 | 写作时查什么 |
| --- | --- | --- | --- |
| AI 编译器 | [OpenMLSys 英文第二版](https://openmlsys.github.io/) 第 4 章 | [PyTorch `torch.compile`](https://docs.pytorch.org/tutorials/intermediate/torch_compile_tutorial.html) | 从 eager 执行引出图捕获、graph break、编译与稳态性能，区分首轮编译开销和后续运行耗时。 |
| 本地与端侧推理 | [AIInfraGuide 推理优化第 9 章](https://caomaolufei.github.io/AIInfraGuide/inference/) | [llama.cpp](https://github.com/ggml-org/llama.cpp) | 用 GGUF 小模型对照精度、上下文长度、内存和 token 吞吐，记录 CPU/GPU offload 的条件。 |

## 给写作模型的指令模板

> 为算力工地写《{选题}》，面向{读者背景}。先读 `compute-factory-source-index.md`，按章节名或关键词找到对应条目。打开相关教程的正文，找出适合新手理解这项机制的顺序。再用原论文、指定版本的文档或源码核对关键结论。用自己的例子说明它解决什么问题、具体如何工作、读者如何验证。文章交代先修知识、实验环境、步骤和结果判断方法，并在相关段落附上实际查阅的来源。框架行为写明版本，实验数据写明条件。若没有实测，用预期现象或待验证项表述。

## 资源下载链接

标注「PDF」「EPUB」或「ZIP」的链接直达文件。「下载页」和「课表」可按语言、版本或讲次选文件。源码 ZIP 取仓库默认分支，需要复现某一版本时，从原仓库选择相应的 tag。只有网页入口的单篇教程，可以在浏览器中另存网页或打印成 PDF。写文章时仍用上面的正文链接标注出处。

### 学习站点与课程

| 资源 | 下载入口 | 解压或下载后从哪里看 |
| --- | --- | --- |
| AIInfraGuide | [教程源码 ZIP](https://github.com/caomaolufei/AIInfraGuide/archive/HEAD.zip) | 从 `docs/` 或根目录的分章资料开始查。 |
| Datawhale × RadixArk · zero-to-sglang | [中文 PDF](https://github.com/datawhalechina/zero-to-sglang/releases/download/pdf-2026-11-12/zero-to-SGLang_Chinese.pdf) · [英文 PDF](https://github.com/datawhalechina/zero-to-sglang/releases/download/pdf-2026-11-12/zero-to-SGLang_English.pdf) · [课程源码 ZIP](https://github.com/datawhalechina/zero-to-sglang/archive/HEAD.zip) | PDF 对应 2026-11-12 发布版。源码中的 `course-material/ch/` 可按章读 Markdown。 |
| AI Infra Atlas | [站点源码 ZIP](https://github.com/wushanchi/ai-infra-atlas/archive/HEAD.zip) · [清单导出页](https://wushanchi.github.io/ai-infra-atlas/resources.html) | 查看资源地图的数据与页面，也可以在资源库点击「导出学习清单 (.md)」。 |
| AIInfra 基础设施教程 | [离线站点 ZIP](https://github.com/Infrasys-AI/aiinfra-docs/archive/HEAD.zip) · [导论课件 PDF](https://infrasys-ai.github.io/aiinfra-docs/_downloads/3230cf596f7728d8016879fffd217438/01Introduction.pdf) | 解压后打开 `index.html` 浏览，章节源文本在 `_sources/`。 |
| OpenMLSys | [中文第一版源码 ZIP](https://github.com/openmlsys/openmlsys-zh-1/archive/HEAD.zip) · [第二版项目源码 ZIP](https://github.com/openmlsys/openmlsys/archive/HEAD.zip) | 引用时写明第一版或第二版，并打开相同版次的章节核对。 |
| AI Infra Handbook | [站点源码 ZIP](https://github.com/cypggs/AI_Infra_Handbook/archive/HEAD.zip) | 按学习路线定位 Linux、Kubernetes、分布式训练或推理专题。 |
| AI Infra 系统学习库 | [课程源码 ZIP](https://github.com/wujhsu/ai-infra-learning-lab/archive/HEAD.zip) | 下载讲义源文件、演示、实验和运行记录。 |
| WSJ 的 AI Infra 笔记 | [笔记站源码 ZIP](https://github.com/wsj040303/wsj040303.github.io/archive/HEAD.zip) | 从 `ai-infra/` 进入，按 `notes/` 下的推理和并行等专题查找。 |
| BBuf · CUDA 与 AI Infra 优化笔记 | [笔记及代码 ZIP](https://github.com/BBuf/how-to-optim-algorithm-in-cuda/archive/HEAD.zip) | 查 `cuda-kernels/`、`triton/`、`cutlass/` 内的正文和示例。 |
| Stanford CS336 | [公开讲义 ZIP](https://github.com/stanford-cs336/lectures/archive/HEAD.zip) · [课程站源码 ZIP](https://github.com/stanford-cs336/stanford-cs336.github.io/archive/HEAD.zip) · [作业 1 源码 ZIP](https://github.com/stanford-cs336/assignment1-basics/archive/HEAD.zip) · [课表与其余作业](https://cs336.stanford.edu/) | 讲义 ZIP 收录公开的课件。课表有各讲的链接和其他作业入口。 |
| UC Berkeley · Scalable AI | [L2 性能分析课件 PDF](https://scalable-ai.eecs.berkeley.edu/S2026/assets/lecture_slides/lecture2.pdf) · [L18 推理框架课件 PDF](https://scalable-ai.eecs.berkeley.edu/S2026/assets/lecture_slides/lecture_18.pdf) · [2026 春季课表](https://scalable-ai.eecs.berkeley.edu/S2026/) | 按课表的 `Slides` 下载其他讲次。 |
| Machine Learning Systems | [第一卷 PDF](https://mlsysbook.ai/vol1/assets/downloads/Machine-Learning-Systems-Vol1.pdf) · [第二卷 PDF](https://mlsysbook.ai/vol2/assets/downloads/Machine-Learning-Systems-Vol2.pdf) | 第一卷查系统与硬件基础，第二卷查大规模训练和推理。 |
| How to Scale Your Model | [教材源码 ZIP](https://github.com/jax-ml/scaling-book/archive/HEAD.zip) | 下载章节 Markdown、公式和配图，按 `roofline`、`training`、`inference` 查找。 |
| The Ultra-Scale Playbook | [完整 PDF](https://huggingface.co/spaces/nanotron/ultrascale-playbook/resolve/main/The_Ultra-Scale_Playbook_Training_LLMs_on_GPU_Clusters.pdf?download=true) · [Markdown 原文](https://huggingface.co/spaces/nanotron/ultrascale-playbook/resolve/main/ultra_blog.md?download=true) | PDF 用于离线读，Markdown 便于模型查段落。 |
| Stas Bekman · Machine Learning Engineering | [PDF](https://huggingface.co/stas/ml-engineering-book/resolve/main/Stas%20Bekman%20-%20Machine%20Learning%20Engineering.pdf?download=true) · [EPUB](https://huggingface.co/stas/ml-engineering-book/resolve/main/Stas%20Bekman%20-%20Machine%20Learning%20Engineering.epub?download=true) · [教材源码 ZIP](https://github.com/stas00/ml-engineering/archive/HEAD.zip) | 查 `training/`、`network/`、`storage/` 和 `orchestration/`。 |

### 专题文档、课件与代码

| 专题 | 下载入口 | 包含内容 |
| --- | --- | --- |
| Python 与打包 | [Python 中文文档下载页](https://docs.python.org/zh-cn/3/download.html) · [Python 英文文档下载页](https://docs.python.org/3/download.html) · [Packaging User Guide 源码 ZIP](https://github.com/pypa/packaging.python.org/archive/HEAD.zip) | 教程与标准库可从 Python 下载页选择 HTML 或 EPUB。打包教程另有源码。 |
| Git、Docker、CMake 与 C++ | [Pro Git 中文 PDF](https://github.com/progit/progit2-zh/releases/download/2.1.80/progit.pdf) · [Docker 文档 ZIP](https://github.com/docker/docs/archive/HEAD.zip) · [CMake 源码与教程 ZIP](https://github.com/Kitware/CMake/archive/HEAD.zip) · [C++ Core Guidelines 源码 ZIP](https://github.com/isocpp/CppCoreGuidelines/archive/HEAD.zip) | CMake 教程在 `Help/guide/tutorial/`。 |
| Hugging Face LLM Course 与 Transformers | [LLM Course 教材 ZIP](https://github.com/huggingface/course/archive/HEAD.zip) · [Transformers 文档与源码 ZIP](https://github.com/huggingface/transformers/archive/HEAD.zip) | 课程源码含各语言正文。生成与量化文档可在 Transformers 仓库中查找。 |
| PyTorch | [教程 ZIP](https://github.com/pytorch/tutorials/archive/HEAD.zip) · [PyTorch 文档与源码 ZIP](https://github.com/pytorch/pytorch/archive/HEAD.zip) | 前者含基础、AMP、DDP、FSDP、TP、分布式 checkpoint 和 `torch.compile` 教程。后者可查张量视图和 `inference_mode` 等 API。 |
| GPU 并行课程 | [Stanford CS149 课表与课件](https://gfxcourses.stanford.edu/cs149/fall25) · [GPU MODE 讲义与代码 ZIP](https://github.com/gpu-mode/lectures/archive/HEAD.zip) | CS149 按讲次打开课件。GPU MODE 可整包下载。 |
| CUDA C++ 与开发环境 | [CUDA 编程指南 PDF](https://docs.nvidia.com/cuda/cuda-programming-guide/pdf/cuda-programming-guide.pdf) · [Linux 安装指南 PDF](https://docs.nvidia.com/cuda/pdf/CUDA_Installation_Guide_Linux.pdf) · [WSL 用户指南 PDF](https://docs.nvidia.com/cuda/pdf/CUDA_on_WSL_User_Guide.pdf) · [CUDA Samples ZIP](https://github.com/NVIDIA/cuda-samples/archive/HEAD.zip) | 编程指南含编程模型、SIMT kernel 和 CUDA Graphs。代码示例在 Samples。 |
| Triton、CUTLASS 与 CuTe | [Triton 教程与源码 ZIP](https://github.com/triton-lang/triton/archive/HEAD.zip) · [CUTLASS 与 CuTe 文档及源码 ZIP](https://github.com/NVIDIA/cutlass/archive/HEAD.zip) · [Tensor Core GEMM 博文网页](https://alexarmbr.github.io/2024/08/10/How-To-Write-A-Fast-Matrix-Multiplication-From-Scratch-With-Tensor-Cores.html) | Triton 查 `python/tutorials/`。CUTLASS 查 `examples/`、`include/cute/` 和文档。GEMM 博文可用浏览器另存。 |
| Nsight 与 Attention 内核 | [Nsight Systems 用户指南 PDF](https://docs.nvidia.com/nsight-systems/pdf/UserGuide.pdf) · [Nsight Compute Profiling Guide PDF](https://docs.nvidia.com/nsight-compute/pdf/ProfilingGuide.pdf) · [FlashInfer 源码 ZIP](https://github.com/flashinfer-ai/flashinfer/archive/HEAD.zip) · [FlashAttention 源码 ZIP](https://github.com/Dao-AILab/flash-attention/archive/HEAD.zip) | 分别下载时间线、单 kernel 性能分析手册，以及注意力算子的实现。 |
| 推理引擎与源码走读 | [vLLM 文档与引擎 ZIP](https://github.com/vllm-project/vllm/archive/HEAD.zip) · [Inside vLLM 博文站点源码 ZIP](https://github.com/vllm-project/vllm-project.github.io/archive/HEAD.zip) · [SGLang 文档与引擎 ZIP](https://github.com/sgl-project/sglang/archive/HEAD.zip) · [Mini-SGLang ZIP](https://github.com/sgl-project/mini-sglang/archive/HEAD.zip) · [nano-vLLM ZIP](https://github.com/GeeeekExplorer/nano-vllm/archive/HEAD.zip) | 按所写框架查调度、KV Cache、量化、并行与服务。小引擎适合快速走读。 |
| 推理压测和质量评估 | [GuideLLM ZIP](https://github.com/vllm-project/guidellm/archive/HEAD.zip) · [LM Evaluation Harness ZIP](https://github.com/EleutherAI/lm-evaluation-harness/archive/HEAD.zip) | vLLM 自带压测和指标文档也可在上一行的 vLLM 包中查找。 |
| 分布式推理与生产部署 | [NVIDIA Dynamo ZIP](https://github.com/ai-dynamo/dynamo/archive/HEAD.zip) · [llm-d ZIP](https://github.com/llm-d/llm-d/archive/HEAD.zip) · [KServe 文档站源码 ZIP](https://github.com/kserve/website/archive/HEAD.zip) | 查 P/D 分离、Kubernetes 部署和路由。KServe 站点仓库可检索版本化文档。 |
| 集合通信与分布式训练 | [NCCL 源码 ZIP](https://github.com/NVIDIA/nccl/archive/HEAD.zip) · [nccl-tests ZIP](https://github.com/NVIDIA/nccl-tests/archive/HEAD.zip) · [DeepSpeed 教程与源码 ZIP](https://github.com/deepspeedai/DeepSpeed/archive/HEAD.zip) · [Megatron-LM 文档与源码 ZIP](https://github.com/NVIDIA/Megatron-LM/archive/HEAD.zip) | 查集合通信实现和带宽测试。ZeRO 教程位于 DeepSpeed 的 `docs/_tutorials/zero.md`。 |
| 本地与端侧推理 | [llama.cpp 源码 ZIP](https://github.com/ggml-org/llama.cpp/archive/HEAD.zip) · [llama.cpp 安装包下载页](https://github.com/ggml-org/llama.cpp/releases/latest) | 读代码用 ZIP。运行时可从 Releases 选择对应操作系统和加速后端的预编译包。 |

### 论文 PDF

| 主题 | 下载入口 |
| --- | --- |
| 连续批处理与调度 | [Orca PDF](https://www.usenix.org/system/files/osdi22-yu.pdf) |
| 分页 KV Cache | [PagedAttention PDF](https://arxiv.org/pdf/2309.06180) |
| 前缀缓存与 RadixAttention | [SGLang PDF](https://arxiv.org/pdf/2312.07104) |
| Chunked Prefill | [Sarathi-Serve PDF](https://www.usenix.org/system/files/osdi24-agrawal.pdf) |
| 投机解码 | [Fast Inference from Transformers via Speculative Decoding PDF](https://arxiv.org/pdf/2211.17192) |
| Prefill/Decode 分离 | [DistServe PDF](https://arxiv.org/pdf/2401.09670) |
| 注意力 I/O 优化 | [FlashAttention PDF](https://arxiv.org/pdf/2205.14135) |
| 训练并行 | [Megatron-LM PDF](https://arxiv.org/pdf/2104.04473) |
