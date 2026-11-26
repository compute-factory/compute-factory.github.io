---
title: 测量与定位：延迟、吞吐与时间线剖析
description: 建立推理服务的延迟、吞吐与 Goodput 指标体系，掌握 PyTorch Profiler、Nsight Systems、Nsight Compute 与 CPU 采样的原理和实战定位流程。
---

# 测量与定位：延迟、吞吐与时间线剖析

线上推理服务一旦变慢，单纯看平均响应时间或每秒产出词元数无法回答「究竟慢在哪一层」：高并发下请求阻塞在调度队列、长输入拉长首字预填充、连续批处理抢占制造解码抖动、HTTP 流式模板增加 CPU 前处理税，或是宿主端同步等待、重复转换与内存重分配留出了大量 GPU 空档。此外，若不固定输入输出分布、到达率与随机种子，不同优化方案测得的吞吐数字也不具备可比性。

全文以开源模型 `Qwen/Qwen3-0.6B`（`bfloat16`，28 层、16 个 Q 头 / 8 个 KV 头）的系统测量与诊断为主线，依次建立延迟与吞吐指标体系、剖析部署接口与压测控制变量、拆解四类 Profiler 原理，并结合真实跨引擎慢推理排查案例与零基础动手实战，串联起「指标压测 → 时间线定位 → 核函数诊断 → 代码优化」的工程闭环。

## 延迟与吞吐指标

同样是每秒产出十余个词元，用户感受到的流畅度与服务端统计的吞吐率往往存在巨大反差。要分清瓶颈究竟出在调度排队、首字计算还是逐词元解码，必须先拆解一次推理请求的四个时间切面。

### 延迟指标：TTFT、TPOT 与 ITL

**单看端到端耗时无法定位慢在预填充还是解码，必须把流式请求拆成首词元延迟与词元间间隔两段来测。**

流式推理请求从客户端发出到全部输出结束，跨越排队、预填充（Prefill）与解码（Decode）三个时段，对应四个核心延迟指标（统计口径核对自 [vLLM `bench serve` 源码](https://docs.vllm.ai/en/latest/cli/bench/serve/)）：

- **首词元延迟（Time to First Token, TTFT）**：从客户端发出请求到收到首个生成词元（Token）的耗时，覆盖网络传输、调度排队与 Prefill 计算，决定用户等待第一行字出现的时间。
- **每输出词元耗时（Time Per Output Token, TPOT）**：扣除首个词元后，单条请求平均每生成一个后续词元所需的时间，主要由显存带宽受限的 Decode 阶段决定。
- **词元间延迟（Inter-Token Latency, ITL）**：相邻两个流式到达词元之间的真实时间间隔；与 TPOT 度量同一生成过程，区别在于 ITL 保留逐次间隔分布，能直接暴露中途卡顿。
- **端到端延迟（End-to-End Latency, E2EL）**：单个请求从发送起直到收到末位词元的完整耗时。

![一次流式推理请求的延迟拆解与 ITL 尖峰示意](/images/inference/measurement/request-latency-timeline.svg)

*图 1：一次流式推理请求的时间轴拆解，对照 TTFT、TPOT 均值与批内新 Prefill 插入造成的 ITL 尖峰。*

对照图 1 从左到右的时间轴，请求在 `t_send` 发出后先经过步骤 ① 排队等待与步骤 ② Prefill 预填充，并在 `t₁` 吐出第一个词元 `T1`，这一段跨度即 `TTFT = t₁ - t_send`。随后进入连续解码阶段，在生成 `N_out` 个词元的情况下，端到端耗时满足以下关系：

$$\text{E2EL} = \text{TTFT} + (N_{\text{out}} - 1) \times \text{TPOT} \tag{1}$$

式 (1) 揭示了观察指标的关键分工：**当批内插入新的 Prefill 任务时（图 1 步骤 ③），所有正在解码的请求必须暂停一步等待，进而在 `t₃ → t₄` 处形成一个突刺般的 `ITL₃` 尖峰**。在并发 32 压测 `Qwen/Qwen3-0.6B`（输入 512 / 输出 128）的实测中，<mark>P99 TPOT 仅显示为 8.42 ms，但 P99 ITL 却飙升至 37.75 ms（约为 P50 ITL 6.48 ms 的 5.8 倍）</mark>——因为单次抢占停顿被其余 126 个平稳解码步平均摊薄，只看 TPOT 会漏掉用户视角下的流式卡顿。

::: details 点击展开：vLLM 源码中的指标统计口径与分解验算
1. **源码口径（`vllm 0.33.0` `vllm/benchmarks/serve.py` 中 `calculate_metrics()`）**：
   - `ttft` 记录发送请求到收到首个流式分块的时间差。
   - 当输出词元数 $N_{\text{out}} > 1$ 时，计算单请求均值 $\text{TPOT} = (\text{E2EL} - \text{TTFT}) / (N_{\text{out}} - 1)$；若 $N_{\text{out}} \le 1$，该请求不计入 TPOT 分位统计（Goodput 判定时默认视为 $0$）。
   - `itls` 将所有成功请求各自的逐跳间隔列表直接拼接成一个全局数组再求分位数，不先在请求内部求平均。
2. **用并发 1 实测值（输入 512 / 输出 128）验算式 (1)**：
   $$
   \begin{aligned}
   \text{E2EL}_{\text{P50}} &= \text{TTFT}_{\text{P50}} + (N_{\text{out}} - 1) \times \text{TPOT}_{\text{P50}} &&\text{（端到端分解式）} \\
   &= 12.39 + 127 \times 2.71 &&\text{（代入 P50 实测值）} \\
   &= 12.39 + 344.17 &&\text{（计算解码总耗时）} \\
   &= 356.56\ \text{ms} &&\text{（与实测 357.04 ms 误差 0.13%）}
   \end{aligned}
   $$
:::

### 吞吐、尾延迟与 Goodput

**脱离延迟约束的高吞吐只是排队堆积的假象，服务容量上限必须由分位数尾延迟与有效吞吐共同划定。**

评估系统单位时间的处理能力时，需要区分原始产出率与达标产出率：

- **请求吞吐量（Request Throughput）**：单位时间内系统完成的总请求数（`req/s`），反映服务端对业务流量的总体消化速率。
- **词元吞吐量（Token Throughput）**：分为仅计算生成结果的**输出词元吞吐量（Output Token Throughput）**和包含输入与输出之和的**总词元吞吐量（Total Token Throughput）**，单位均为 `tok/s`。
- **尾延迟（Tail Latency, P95 / P99）**：将所有样本耗时升序排列后第 95% 或第 99% 位置的值，反映最慢那批请求的真实等待体验。
- **服务等级目标（Service Level Objective, SLO）**与**有效吞吐量（Goodput）**：由 [DistServe](https://arxiv.org/abs/2401.09670) 提出并在 `vllm bench serve` 中落地；Goodput 只统计在压测窗口内**同时满足全部预设延迟 SLO（如 TTFT ≤ 200 ms 且 TPOT ≤ 15 ms）的达标请求数除以总时长**。

| 评估维度 | 常见误用指标 | 工程真实口径 | 并发 64 实测反差（512→128） |
|---|---|---|---|
| 延迟分布 | 仅报告均值（Mean） | P50 配合 P95 / P99 分位数 | Mean TTFT 为 190.64 ms，P99 达 661.28 ms（P50 的 4.85 倍） |
| 解码流畅度 | 仅报告 TPOT 均值 | P50 TPOT 配合 P99 ITL | P99 TPOT 为 14.86 ms，P99 ITL 达 45.52 ms |
| 服务产能 | 仅追求原始 `req/s` 或 `tok/s` | 绑定业务延迟上限的 Goodput | 总吞吐升至 32.80 req/s，Goodput 反跌至 26.65 req/s |

上表改变了单卡压测的容量判断标准：<mark>在并发度拉高后，少数长尾超时请求会让原始吞吐继续小幅攀升，但大量违反 SLO 的响应不再产生业务价值，导致 Goodput 率先出现倒退</mark>。容量规划必须以「Goodput 峰值对应并发」而非「最大原始吞吐对应并发」作为服务上限。

## 部署差异与压测设计

选定观测指标之后，并发请求数量、输入输出长度比例以及 HTTP 接口形态，都会直接左右测得的吞吐上限与尾延迟曲线。若不把压测协议栈与负载分布锁在同一基准线上，跨版本或跨引擎的评测对比就会失去依据。

### 并发度与输入输出长度

**并发度把服务推过吞吐拐点并拉出尾延迟陡坡，而输入输出长度比例决定了系统瓶颈落在 Prefill 算力还是 Decode 带宽。**

固定输入 512 词元、输出 128 词元（开启 `--ignore-eos`，SLO 设为 `TTFT ≤ 200 ms` 且 `TPOT ≤ 15 ms`），依次测试最大并发度 `C = 1, 8, 32, 64`：

![并发度对吞吐、Goodput 与尾延迟的影响（单卡 GPU 实测）](/images/inference/measurement/concurrency-throughput-latency.svg)

*图 2：`Qwen/Qwen3-0.6B`（`bfloat16`）在 4 组并发度下的请求吞吐与 Goodput 对比（左），以及 P50 / P99 TTFT 随并发爬升的曲线（右）。*

> **实测口径说明**：下方表 2 与图 2、图 3 中的基准数值采集自单张 NVIDIA GeForce RTX 5070（12 GiB）、CUDA 13.2 与 vLLM 0.33.0 环境，固定 `--ignore-eos` 与随机种子 `--seed 42`。

| 压测配置（`Qwen/Qwen3-0.6B`） | 请求吞吐 (`req/s`) | Goodput (`req/s`) | 输出吞吐 (`tok/s`) | 总词元吞吐 (`tok/s`) | P50 TTFT (ms) | P99 TTFT (ms) | P50 TPOT (ms) | P99 ITL (ms) | P50 E2EL (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `C = 1`（512→128） | 2.80 | 2.80 | 358.56 | 1792.80 | 12.39 | 14.18 | 2.71 | 2.91 | 357.04 |
| `C = 8`（512→128） | 15.33 | 15.33 | 1962.50 | 9812.52 | 14.96 | 21.60 | 3.97 | 4.36 | 520.47 |
| `C = 32`（512→128） | 30.57 | **30.09** | 3912.68 | 19563.39 | 102.94 | 216.97 | 7.71 | 37.75 | 1093.33 |
| `C = 64`（512→128） | 32.80 | 26.65 | 4198.34 | 20991.68 | 136.31 | 661.28 | 14.16 | 45.52 | 1941.96 |
| `C = 16` 长输入（1024→32） | 31.64 | — | 1012.50 | **33412.64** | 120.20 | 321.44 | 11.72 | 40.51 | 497.22 |
| `C = 16` 长输出（128→512） | 7.04 | — | **3606.52** | 4508.15 | 17.25 | 22.18 | 4.41 | 5.46 | 2269.11 |

对照图 2 与上表可得出两条清晰边界：
1. **并发存在 Goodput 拐点**：从 `C = 1` 到 `C = 8`，权重搬运成本被并发请求摊薄，输出吞吐跃升 `5.47` 倍而 P50 TTFT 仅增 `2.57 ms`；`C = 32` 时 Goodput 达到峰值 `30.09 req/s`。<mark>推至 `C = 64` 后，总吞吐微增 7.3%，但 P99 TTFT 冲破 200 ms 红线达到 661.28 ms，Goodput 回落 11.4% 至 26.65 req/s</mark>。
2. **长度比例决定主要矛盾**：`128 → 512` 负载中 P50 TTFT（`17.25 ms`）只占 P50 E2EL（`2269.11 ms`）的 `0.76%`，<mark>超过 99% 的耗时落在 Decode 阶段</mark>；而 `1024 → 32` 负载总词元吞吐高达 `33412.64 tok/s`，但每次 Prefill 抢占都把正在解码的请求打出 `P99 ITL = 40.51 ms` 的毛刺。

### 离线部署与在线 HTTP 接口

**离线引擎直调省去了全部 HTTP 与流式协议税，而在线服务的路由类型与 SSE 推送粒度会直接改变实测吞吐与延迟口径。**

大语言模型推理在工程上有两种部署形态，其前端接口形式直接影响测量结果：

- **离线批量部署（Offline Batch Inference）**：通过 Python 进程直接调用 `vllm.LLM.generate()` 或 `sglang.Engine`，在服务端一次性完成批量分词、全量入队调度与统一反分词。它没有 Web 框架、TCP Socket 和流式分块开销，适合离线评测与批量数据处理，但无法响应实时首字流式请求。
- **在线服务部署（Online Serving）**：通过 `vllm serve` 或 `sglang.launch_server` 暴露 OpenAI 兼容 HTTP 接口，在推理引擎前端增加异步 Web 框架（ASGI/Uvicorn 或 Rust 前端）、Pydantic JSON 校验与基于 **服务端推送事件（Server-Sent Events, SSE）** 的流式连接维持。

![离线批量引擎 vs 在线 HTTP 接口的数据通路与额外开销](/images/inference/measurement/deployment-http-overhead.svg)

*图 3：离线批量模式、`/v1/completions` 流式接口与 `/v1/chat/completions` 对话模板接口的请求链路与实测差异。*

对照图 3 从上到下三条链路，在同硬件与同长度（`512 → 128`）下对比实测数据，协议栈与接口形式的差异体现在三个层面：

| 部署与接口形式 | 请求吞吐 (`req/s`) | 输出吞吐 (`tok/s`) | P50 TTFT (ms) | P99 TTFT (ms) | P50 ITL (ms) | P99 E2EL (ms) |
|---|---:|---:|---:|---:|---:|---:|
| 离线批量（`vllm bench throughput`，256 条） | **32.15** | **4114.69** | — | — | — | — |
| 在线 `/v1/completions`（SSE `stream-interval=1`，`C=32`） | 29.32 | 3752.69 | 114.04 | 243.55 | **6.48** | 1171.86 |
| 在线 `/v1/completions`（SSE `stream-interval=8`，`C=32`） | 29.29 | 3748.91 | 113.44 | 244.81 | **52.26** | 1194.87 |
| 在线 `/v1/chat/completions`（SSE `stream-interval=1`，`C=32`） | 28.46 | 3642.40 | 116.55 | **322.78** | 6.54 | **1304.97** |

1. **流式与非流式决定能否观测 TTFT**：若在线服务采用非流式（`stream=false`），服务端必须等全部词元生成完毕后再一次性返回 JSON，客户端测不到真实 TTFT 与 ITL；压测首字响应必须使用流式 SSE，而每次推送都要在服务端执行 **UTF-8 增量解码（防止多字节中文在词元边界被截断乱码）** 与 `data: {...}\n\n` 封包。
2. **SSE 批量推送粒度直接放大客户端 ITL**：`--stream-interval` 默认为 `1`（每生成 1 个词元刷写一次 Socket）；调大为 `8` 后，服务端每攒满 8 个词元才推送一帧 SSE，<mark>客户端实测 P50 ITL 从 6.48 ms 直接跳升至 52.26 ms（约 8 倍）</mark>，而服务端真实生成均速（P50 TPOT `7.72 ms`）并未变慢。
3. **`/v1/chat/completions` 隐含模板渲染与长度膨胀**：同样随机生成 512 长度文本发送，`/v1/chat/completions` 在服务端执行 **Jinja2 对话模板（Chat Template）** 渲染，为每条请求注入了 `8` 个角色控制词元（128 条请求总输入从 `65536` 增至 `66560` tokens），叠加结构化字段校验，使 <mark>P99 TTFT 从 243.55 ms 升至 322.78 ms（+32.5%）</mark>，吞吐下降 `2.9%`。

### 压测工具层级与控制变量

**只有当工具栈层级、到达率模型与输入输出分布完全对齐时，压测数字才能用来评判系统优化的真伪。**

主流推理引擎（如 vLLM 与 SGLang）通常提供四层压测工具（核对自 [SGLang Benchmark 文档](https://docs.sglang.io/docs/developer_guide/benchmark_and_profiling#benchmark) 与 [vLLM Benchmark CLI](https://docs.vllm.ai/en/latest/cli/bench/serve/)）：

| 工具层级 | 代表命令（vLLM / SGLang / 生态） | 经过 HTTP | 经过连续批调度器 | 适用目的与边界 |
|---|---|---|---|---|
| 在线服务压测 | `vllm bench serve` / `sglang.bench_serving` / [GuideLLM](https://github.com/vllm-project/guidellm) | 是 | 是 | 还原真实流式流量，测 TTFT、TPOT、ITL、P99 与 Goodput |
| 单批服务端 | `sglang.bench_one_batch_server` | 是 | 是 | 测单个静态批次经 API 栈的耗时，不含稳态持续排队 |
| 引擎离线吞吐 | `vllm bench throughput` / `sglang.benchmark.offline_throughput` | 否 | 是 | 剥离 HTTP 与 SSE 开销，测批量处理上限 |
| 单批算子基线 | `vllm bench latency` / `sglang.benchmark.one_batch` | 否 | 否 | 直接驱动模型前向，专用于 Kernel 级耗时隔离分析 |

开展线上对比测试时，必须锁定以下 5 个控制变量，避免把测量误差当成架构收益：
1. **充分预热（Warmup）**：在正式统计前先发送一批热身请求，让 CUDA 上下文初始化、KV Cache 页表分配与 CUDA Graph 捕获进入稳态。
2. **区分闭环并发与开环到达率（避免协同遗漏）**：固定并发池（`--max-concurrency`）属于闭环压测，一旦后端变慢，客户端会同步放慢发包节奏，从而掩盖真实排队拥塞（即 **协同遗漏，Coordinated Omission**）；测线上真实尾延迟需配合 `--request-rate` 与 `--burstiness`（默认 `1.0` 对应泊松到达）按固定时间表发包。
3. **锁定输入输出长度与 `--ignore-eos`**：对比两个引擎版本时，提前触发 `<eos>` 会让输出变短并虚高 `tok/s`；压力测试需配合固定长度分布或真实对话 Trace 并保持请求数 `num_prompts >= 5 × max_concurrency`。
4. **固定采样随机种子（`--seed`）**：Top-p / Top-k 采样依赖随机数触发不同的分支循环，不固定种子会在对比实验间引入额外波动。
5. **不跨分词器（Tokenizer）直接比较 `tok/s`**：不同模型词表切分同一段中文得到的词元数差异很大，跨模型对比必须换算为「每秒有效中文字符数」。

::: details 点击展开：chat 接口与离线吞吐对照命令及参数解读
以下命令用于在同一模型与长度分布下，单独剥离对话模板与 HTTP 接口对吞吐和首字延迟的影响（`MODEL_ID` 可替换为本地模型路径 `/path/to/models/Qwen3-0.6B`）：

```bash
# 1. 测试 /v1/chat/completions 对话模板接口（注意切换 --backend 与 --endpoint）
vllm bench serve --backend openai-chat --endpoint /v1/chat/completions \
  --base-url http://127.0.0.1:8000 \
  --model "$MODEL_ID" \
  --dataset-name random --random-input-len 512 --random-output-len 128 \
  --ignore-eos \              # 禁止提前遇到 EOS 结束，锁定输出长度
  --num-prompts 128 \         # 请求总量设为并发数的 4 倍以上以进入稳态
  --max-concurrency 32 \      # 固定闭环最大并发数
  --seed 42                   # 固定随机种子，避免采样波动

# 2. 测试离线引擎极限吞吐（不经过 HTTP / Uvicorn / SSE 协议栈）
vllm bench throughput --model "$MODEL_ID" --dtype bfloat16 --max-model-len 4096 \
  --dataset-name random --random-input-len 512 --random-output-len 128 \
  --num-prompts 256 --seed 42
```

**参数与结果口径说明**：
1. **`--backend openai-chat` vs `--backend openai`**：前者在服务端触发 Jinja2 模板注入角色词元，适合还原真实对话接口压力，但对比纯解码性能时会额外多出约 8 个输入词元开销。
2. **`vllm bench throughput` 无延迟分位数**：离线命令一次性将 256 条请求交由调度器压满 GPU，输出只含总请求吞吐与词元吞吐，不可直接与在线服务的 `TTFT` / `ITL` 指标并列。
:::

## Profiler 工具与原理

压测能回答「服务整体慢了多少」，但无法指出时间究竟花在 CPU 调度、数据搬运还是 GPU 计算上，这时就需要 **性能剖析（Profiling）** 工具。排查时一般按「先看全局时间线找空白与慢步 → 再看模型各类算子占比 → 必要时解剖单个计算步骤的硬件上限」由粗到细推进，避免一上来在零碎代码上盲目调优。

![推理性能剖析的三层工具阶梯与定位分工](/images/inference/measurement/profiling-tools-ladder.svg)

*图 4：三层 GPU Profiler 工具阶梯与典型判别信号（配合宿主侧 CPU 采样补齐函数级归因）。*

| 剖析工具 | 它看什么 | 什么时候用 | 开销大小 |
|---|---|---|---|
| `PyTorch Profiler` | PyTorch 每类算子的耗时与 Python 调用位置 | 想看模型哪一层或哪类算子最耗时 | 中等（只抓 5–10 步） |
| `Nsight Systems (nsys)` | 整条运行时间线：CPU、驱动调用、数据拷贝与 GPU 计算 | 想看 GPU 有没有大片空闲在等 CPU | 低（适合全局体检） |
| `Nsight Compute (ncu)` | 单个 GPU 计算步骤的算力与显存带宽利用率 | 已锁定某一步很慢，想查它卡在算力还是带宽 | 极高（只抓 1 个步骤） |
| `CPU 采样`（如 `gperftools`） | GPU 没干活时，CPU 正在跑哪个函数 | `nsys` 出现大段 GPU 空白但原因在 CPU 逻辑 | 低（补充非 GPU 开销） |

### PyTorch Profiler

**PyTorch Profiler 把 GPU 上的计算耗时对应回 Python 模型代码，适合在框架层快速统计各类算子的开销占比。**

- **原理**：模型在运行推理时，PyTorch Profiler 会同时记录两件事——CPU 发出了哪个 PyTorch 算子（例如矩阵乘、注意力计算），以及这个算子在 GPU 上实际跑了多久，最后按时间先后拼成一份可交互的时间线文件（Trace）[^trace]。
- **作用**：用来查看一次推理里，矩阵乘、注意力、归一化等各类操作各自占了多少时间，方便发现「本可以合并执行」的零碎小算子。例如前面 `Qwen3-0.6B`（`C=8`）的实测中，解析 Trace 就能直接看到矩阵乘占 `60.8%`、注意力占 `28.3%`。
- **用法**：切忌从服务启动一直录到结束（文件会非常大）。正确做法是在服务参数中指定输出目录，等压测热身完毕后发送 `--profile` 只抓 5–10 个稳态迭代，再把生成的 `.json.gz` 文件拖进浏览器的 [Perfetto UI](https://ui.perfetto.dev/) 即可直接查看。

[^trace]: **执行追踪（Trace）与核函数（Kernel）**：Kernel 指的是真正在 GPU 上运行的小计算程序（比如一次矩阵乘）；Trace 则是把 CPU 下发指令与 GPU 执行这些 Kernel 的起止时刻，按同一根时间轴画出来的记录文件。

### Nsight Systems（nsys）与 NVTX

**Nsight Systems 从系统全局视角录制 CPU 与显卡的活动，专门用来分辨「GPU 算得慢」还是「GPU 经常空等 CPU」。**

- **原理**：PyTorch Profiler 只看得见 PyTorch 内部算子，而 `nsys` 站在操作系统和显卡驱动层工作，不管推理引擎是 Python 还是 C++（如 `llama.cpp`）都能全程录制。它还能通过 `Correlation ID` 将 CPU 侧的 CUDA API 调用（如 `cudaLaunchKernel`、`cudaMemcpyAsync`）与 GPU 侧真实执行的 Kernel 或显存拷贝一一配对；如果在代码关键步骤前后加上 **NVTX 标记**[^nvtx]，时间轴上就会直接标出「热身」「第 1 批」「采样」等业务阶段名称。

![Nsight Systems 官方时间线关联示例](/images/inference/measurement/official-nsys-correlation.png)

*图 5：Nsight Systems 官方时间线示例：下方 `CUDA API` 调用通过 `Correlation ID` 直接映射至上方 `CUDA HW` 的 GPU Kernel 与显存拷贝条带，用来分辨究竟是算力吃满还是 CPU 同步等待。来源：[NVIDIA Nsight Systems User Guide](https://docs.nvidia.com/nsight-systems/UserGuide/index.html)。*

- **作用**：一是计算**真实 GPU 活跃率**（看看整段时间里 GPU 真正干活占多少比例，有没有大段空白）；二是导出接口汇总表，检查有没有反复同步等待或频繁申请内存的异常调用；三是列出耗时排名前几位的计算步骤。前面对照开启和关闭 **CUDA Graph**[^cuda-graph] 时，正是通过时间线观察到 GPU 活跃率从 `34.1%` 跳升至 `97.6%`。
- **用法**：在启动命令前加上 `nsys profile`。压测长时运行的服务时，推荐开启「延迟录制（`--start-later`）」选项，等热身完成后在另一终端手动开始和结束录制；分析时既可以用图形界面 `nsys-ui` 看图，也能在终端用 `nsys stats` 直接打印统计表。

[^nvtx]: **NVTX（NVIDIA Tools Extension）**：NVIDIA 提供的轻量级阶段标记接口。在函数入口和出口加一行标记后，就能在 `nsys` 时间线上直观看到某段 GPU 空白究竟发生在哪一段业务逻辑里。
[^cuda-graph]: **CUDA 图（CUDA Graph）**：普通模式下 CPU 每执行一层就要向 GPU 发一次启动请求，发请求的间隙会让 GPU 短暂空转；CUDA Graph 会把固定顺序的一串 GPU 任务提前录成静态图，运行时由 CPU 一次触发整张图，消除逐个发射的等待间隙。

### Nsight Compute（ncu）

**Nsight Compute 对单个最慢的 GPU 计算步骤做深度体检，用来判断它究竟卡在算力不够快，还是显存读写跟不上。**

- **原理**：`nsys` 能找出最花时间的计算步骤，但不知道显卡内部为什么跑不快。`ncu` 会拦截这**单个计算步骤**并在底层反复重放很多遍，收集算力核心、各级缓存和显存读写的硬件计数器，因此运行极慢，绝对不能直接套在整轮服务压测上使用。
- **作用**：看清它在 **屋顶线（Roofline）**[^roofline] 上的位置——重点对照「算力利用率（SM Throughput）」和「显存带宽利用率（DRAM Throughput）」两个百分比。以单张 NVIDIA GPU 实测 `Qwen/Qwen3-0.6B` 的线性层为例：Decode 阶段一次只算 8 个词元，算力利用率 `45.84%`、显存带宽高达 `74.72%`，说明瓶颈在「从显存搬权重太慢」；Prefill 阶段一次算 4096 个词元，算力利用率达到 `97.51%`、显存带宽仅 `9.46%`，说明计算核心已经吃满。
- **用法**：必须配合过滤参数，只抓目标阶段或目标名称的 1–5 次调用；结束后可在图形界面 `ncu-ui` 查看详细面板，或直接让终端打印汇总指标。

[^roofline]: **屋顶线模型（Roofline Model）**：用来判断计算步骤硬件上限的模型。显卡同时受限于计算速度（算力上限）和显存读写速度（带宽上限）：如果大部分时间花在搬运数据上、计算核心吃不饱，就是**显存带宽受限**（适合用量化减小体积）；如果计算核心接近满载而带宽很闲，就是**算力受限**（适合用低精度计算或拆分长输入）。

### CPU 采样与阶段打点

**当时间线暴露出大段 GPU 空白、而显卡驱动接口本身并不耗时，就需要用 CPU 采样查出宿主程序卡在哪个普通函数。**

- **原理**：GPU 空等的那段时间，CPU 往往在跑完全不涉及显卡的纯程序逻辑（例如文本预处理、调度队列管理、或者在 CPU 上做词表概率排序）。在容器或生产环境中，系统自带采样器常因权限受限无法使用，这时可以用用户态采样工具（如 `gperftools`）通过**栈采样**[^cpu-sampling]记录热点函数，再与 `nsys` 中的阶段标记对齐，算出每个 CPU 阶段各自拖出了多少 GPU 空转时间。
- **作用**：专门揪出「不触发显卡 API、却把 GPU 晾在一边」的 CPU 慢逻辑。接下来的 `llama.cpp` 案例中，正是靠这一步发现了词表采样函数拖垮了整体并发吞吐。
- **用法**：启动服务端时通过环境变量挂载采样库即可采集 CPU 热点；在 C++/Python 关键步骤加上 NVTX 阶段打点后，便能把 CPU 耗时直接映射回时间线上的每一段 GPU 空白。

[^cpu-sampling]: **栈采样（Stack Sampling）**：不需要给每行代码手动计时，而是每隔极短固定时间（如 1 毫秒）记录一次 CPU 当下正在执行的函数调用链。采样结果中出现频率越高的函数，占用的 CPU 时间越多，本身性能损耗极低。

::: details 点击展开：四类 Profiler 通用 Linux 实操命令与 Trace 核算说明
```bash
# 1. Nsight Systems：延迟抓窗（跳过模型加载）+ 导出 CUDA API / Kernel 汇总表
nsys profile --trace=cuda,nvtx,osrt --cuda-graph-trace=node --start-later \
  -o srv_timeline python3 -m ... # 服务热身就绪后，在另一终端运行下方 nsys start/stop
nsys sessions list                # 查询当前挂起的录制会话 ID
nsys start --session=<SESSION_ID> && sleep 10 && nsys stop --session=<SESSION_ID>
nsys stats --report cuda_api_sum,cuda_gpu_kern_sum srv_timeline.nsys-rep

# 2. Nsight Compute：仅过滤目标 Kernel 采集硬件吞吐与占用率，切勿全量跑整轮压测
ncu --nvtx --nvtx-include "target_op/" \
  --section SpeedOfLight --section MemoryWorkloadAnalysis --section Occupancy \
  -o target_kernel --force-overwrite python3 repro_target_op.py
ncu --import target_kernel.ncu-rep --page details

# 3. 用户态 CPU 采样（容器/生产机 perf_event_paranoid 受限时替代 perf）
LD_PRELOAD=/path/to/libprofiler.so.0 \
  CPUPROFILE=/tmp/server.prof ./llama-server ...
google-pprof --text ./llama-server /tmp/server.prof | head -n 30
```

**命令口径与输出排查要点**：
1. **`cuda_api_sum` vs `cuda_gpu_kern_sum`**：前者用来抓高频 `cudaStreamSynchronize` 或毫秒级 `cudaMallocHost` 宿主阻塞；后者列出耗时前几名的真实 GPU 计算算子。
2. **多 Stream 活跃率合并口径**：计算真实 GPU 活跃率时必须按 `[ts, ts + dur]` 先排序并合并重叠区间再求和（完整计算脚本见下方「入门动手实战」），直接累加单 Kernel 耗时会在多流并行场景下算重。
:::

## 实战案例：llama.cpp 慢推理定位

这个案例的实验有一部分直接建立在我们提交的上游 PR [llama : reuse scheduler buffers across requests (#31841)](https://github.com/ggml-org/llama.cpp/pull/31841) 之上。PR 记录了跨请求复用调度器与锁页计算缓冲区的源码改动、复现步骤和讨论；下面的定位过程会多次回到这次修复，读者可以先读 PR，再对照正文里的时间线与数字。

> **实验环境与工作负载口径**：以下案例采集自单张 NVIDIA GeForce RTX 5070（12 GiB）、CUDA 13.4，对比引擎为 `vLLM 0.33.0` 与 `llama.cpp`；模型统一为 `Qwen3-0.6B`，工作负载固定为 256 条变长请求（分 8 批、每批并发 32，总输入 `142827` token，总输出 `133966` token，开启 `ignore_eos`）。

在单请求（并发 1）下调优后，两端速度非常接近（`llama.cpp` `383.9 tok/s` vs `vLLM` `414.4 tok/s`）；**但切到 32 并发批处理时，`vLLM` 仅用 `46.538 s`，而 `llama.cpp` 高达 `286.875 s`，慢了 `6.16` 倍**。

先通过服务端日志排除了「模型未完整卸载到 GPU」的常见误判（确认 `29/29` 层全部位于 GPU），随后按上述四类 Profiler 工具逐步剥开四层隐蔽瓶颈：

### 阶段一：布局碎片与 BF16 转换

**先用 `nsys` 的 Kernel 汇总表与微批追踪识别「微批碎片化」和「占比 42.4% 的冗余类型转换」，再用 `ncu` 核实转换算子的硬件行为并在消除后实现耗时腰斩。**

在 32 并发基线上采集 `nsys` 时间线并对比 `llama.cpp` 与 `vLLM`：

![llama.cpp 正式诊断窗口的 nsys 时间线与 Kernel 汇总](/images/inference/measurement/nsys-llama-kernel-summary.png)

*图 6：`nsys-ui` 展示的同 GGUF 基线时间线与下方 `CUDA GPU Kernel Summary` 汇总表，第一行 `convert_unary` 独占 42.4% 的 GPU 核函数时间。*

![vLLM 同条件对照窗口的 nsys 时间线与 Kernel 汇总](/images/inference/measurement/nsys-vllm-kernel-summary.png)

*图 7：同条件（同 GGUF 模型、32 并发）下 `vLLM` 的 `nsys-ui` 视图，无类型转换算子，主体耗时集中在 `kernel_unified_attention`（57.4%）与 CUTLASS GEMM。*

对照图 6 底部由 `nsys stats --report cuda_gpu_kern_sum` 导出的原始终端输出（完整诊断批），两项结构性病灶立刻浮出水面：

```text
 ** CUDA GPU Kernel Summary (cuda_gpu_kern_sum):

 Time (%)  Total Time (ns)  Instances  Avg (ns)   Med (ns)  Min (ns)  Max (ns)  StdDev (ns)  Name
 --------  ---------------  ---------  ---------  --------  --------  --------  -----------  --------------------------------------------------
     42.4   29,259,032,226    271,096  107,928.7  72,960.0     7,968   601,090    115,145.4  void convert_unary<__nv_bfloat16, __half>(...)
     13.0    8,976,331,354    575,239   15,604.5  12,256.0     7,584    25,824      5,025.6  void mul_mat_vec_f<__nv_bfloat16, float, ...>(...)
     10.7    7,396,204,904    595,960   12,410.6   5,504.0     4,352   546,403     54,520.9  void mul_mat_vec_f<__nv_bfloat16, float, ...>(...)
      6.7    4,644,031,709    390,840   11,882.2   9,280.0     4,608   527,106     36,186.3  void mul_mat_f<__nv_bfloat162, ...>(...)
      5.5    3,806,366,872    133,728   28,463.5  13,120.0     3,616   224,544     45,249.0  void flash_attn_ext_f16<...>(...)
```

1. **非统一 KV 布局引发微批碎片**：由于批内 32 条请求输出长度不一，短请求提前结束后留下的空闲槽位把剩余活跃槽切成了不连续区间（如 `[0, 2, 3]`）。旧版非统一 KV 执行路径要求同一微批槽号连续，将原本 `951` 个逻辑 Decode 步强行拆成 **`6768` 个小微批**（单步最多拆 11 个），导致矩阵乘法 `mul_mat` 累计耗时飙至 `16.590 s`。启用 `--kv-unified`（并在 `v0.9.0` 启用行索引注意力路径 `kv_rows`）后，微批数降回 `948`，矩阵计算累计降至 `2.714 s`，完整八批耗时从 `286.875 s` 降至 `195.977 s`，升级 `v0.9.0` 后进一步降至 **`165.632 s`（针对该问题优化的 PR 版本）**。
2. **`ncu` 剖析头号热点 `convert_unary`**：在 `165.632 s` 阶段，`nsys` 依然显示有 **`42.4%`** 的 GPU 时间消耗在 `convert_unary<__nv_bfloat16, __half>`。用 `ncu` 对该单一核函数抓包查看硬件详情：

![convert_unary 核函数的 Nsight Compute 硬件指标](/images/inference/measurement/ncu-llama-conversion.png)

*图 8：`ncu-ui` 打开 `llama_conversion.ncu-repz` 展示的 `convert_unary` 详情：SM 吞吐 `60.74%`、DRAM 吞吐 `37.44%`、Occupancy `69.53%`。*

对应的 `ncu --import ... --page details` 原始终端输出片段如下：

```text
  void convert_unary<__nv_bfloat16, __half>(...) (1, 1280, 200)x(256, 1, 1), Context 1, Stream 14
    Section: GPU Speed Of Light Throughput
    ----------------------- ----------- ------------
    Metric Name             Metric Unit Metric Value
    ----------------------- ----------- ------------
    Compute (SM) Throughput           %        60.74
    DRAM Throughput                   %        37.44
    Duration                         us       460.64
    Memory Throughput           Gbyte/s       247.75
    Achieved Occupancy                %        69.53
    ----------------------- ----------- ------------
```

这里给出一条关键的诊断原则：**`ncu` 显示某算子 SM 吞吐达 `60.74%`、带宽跑出 `247.75 GB/s`，只说明它本身写得不算差，不代表应该保留它**。该算子存在的原因仅仅是模型以 `BF16` 存 KV Cache，而 CUDA FlashAttention 路径在每步解码时都要临时把它转成 `FP16` 再算！<mark>直接把 KV Cache 类型改为 FP16（`--cache-type-k f16 --cache-type-v f16`）消除掉整类转换后，完整八批耗时从 162.613 s 骤降至 73.648 s（下降 54.71%），与 vLLM（46.141 s）的差距收窄至 1.596 倍</mark>。

### 阶段二：GPU 空档与 CPU 采样

**在 FP16 KV 消除了转换核函数后，`nsys` 时间线暴露出 3.164 s 的 GPU 空档；用 `gperftools` 与 NVTX 阶段交集计算定位到 CPU 词表采样占用了 71.8% 的空档。**

切换到 FP16 KV 后，复查第 1 批（32 并发）的 `nsys` 时间线统计，发现了截然不同的瓶颈形态：
- **vLLM 诊断窗口**：总长 `5.660 s`，GPU 活动并集 `5.571 s`，**GPU 空档仅 `0.089 s`（活跃率 `98.4%`）**。
- **llama.cpp 诊断窗口**：总长 `9.710 s`，GPU 活动并集 `6.546 s`，**GPU 空档高达 `3.164 s`（占整段窗口 32.6%）**。

先通过 `nsys` SQLite 表的 `correlationId` 核对 CUDA Graph 提交开销，排除了「Launch API 次数多导致这 3 秒差距」的猜测（实际直接提交 API 差仅 `0.158 s`）。随后由于系统启用了 `perf_event_paranoid=4` 限制内核采样，改用 `gperftools` CPU 栈采样并配合在关键宿主函数插入 NVTX 区间标记，将宿主阶段与同一份 Trace 中的 GPU 空档求交集，得到 `phase_summary.txt` 原始输出：

```text
window 9.639925738 GPU active 6.565099123 GPU idle 3.074826615
phase calls inclusive_s exclusive_s gpu_idle_exclusive_s
phase/sample_token 17085 2.235952 2.206569 2.206569
phase/backend_compute 981 1.358277 1.358277 0.42784
host_unmarked 0 0.0 0.226746 0.19944
phase/llama_synchronize 18044 5.711894 5.711894 0.113375
```

结果一针见血：<mark>`phase/sample_token` 被调用 17085 次（对应输出 17085 个词元），独自吃掉了 2.207 s 的 GPU 空档，占总空档（3.075 s）的 71.8%</mark>。因为默认路径每生成一个词元都要把 `Qwen3-0.6B` 全部 `151936` 维词表 logits 传回 CPU 逐条构造候选并排序采样，而 vLLM 在 GPU 上直接完成批量 argmax。开启 `--backend-sampling` 将采样链移回 GPU 后，`sample_token` 这一项的 GPU 空档确实从 `2.207 s` 大幅跌至 `0.068 s`——**但整个窗口的总 GPU 空档并没有如期降到 `0.9 s` 左右，反而仍剩 `2.558 s`，完整八批平均耗时也只从 `73.648 s` 微降至 `70.847 s`**。这意味着优化掉旧瓶颈的同时，触发了一个约 `1.5 s` 的新宿主侧阻塞。

### 阶段三：锁页重建与调度器复用

**开启后端采样后 `sample_token` 空档降至 `0.068 s`，但总体 GPU 空档仍剩 `2.558 s`；用 `nsys` 汇总 CUDA API 揪出调度器销毁并重建锁页缓冲区的根因，跨请求复用后将全量耗时压低至 `59.157 s`。**

开启 `--backend-sampling` 后，为什么旧瓶颈消除了 `2.14 s`，总体 GPU 空档却仍高达 `2.558 s`？对 `nsys` 中 `llama-server` 的 `CUDA API` 调用和 `sched_reserve()` NVTX 标记做一次汇总检查，真相立刻浮现：

![开启后端采样优化前 nsys-ui 时间线](/images/inference/measurement/nsys-before-nvtx-timeline.png)

*图 9：优化前（`baseline.nsys-rep`）的 `nsys-ui` 实测时间线，可见客户端 NVTX 区间 `formal_batch_1 [9.147 s]` 与 `llama-server` 线程内对应的 `CUDA HW` 空隙及密集的 `NVTX` / 红色 `CUDA API` 阻塞调用。*

对比优化前（`baseline.sqlite`）与调度器复用优化后（`patched.sqlite`）第 1 批（32 并发）正式窗口的 `nsys stats --report cuda_api_sum` 原始终端输出：

```text
# --- 优化前 (baseline.sqlite) CUDA API Summary ---
 Time (%)  Total Time (ns)  Num Calls    Avg (ns)      Med (ns)   Name
 --------  ---------------  ---------  ------------  -----------  ----------------------
     72.0    6,087,542,547    196,926      30,912.8        531.0  cudaStreamSynchronize
     12.5    1,052,751,772         33  31,901,568.8 31,870,555.0  cudaMallocHost
      4.3      360,917,495         33  10,936,893.8 10,944,866.0  cudaFreeHost

# --- 优化后 (patched.sqlite) CUDA API Summary ---
 Time (%)  Total Time (ns)  Num Calls    Avg (ns)      Med (ns)   Name
 --------  ---------------  ---------  ------------  -----------  ----------------------
     86.4    6,087,659,162    197,015      30,899.5        521.0  cudaStreamSynchronize
      2.8      194,555,198        104   1,870,723.1  1,853,297.5  cudaGraphInstantiate
      2.6      184,979,724     98,056       1,886.5      2,024.0  cudaLaunchKernelExC
```

根因非常清晰——**使用后端采样时，完成请求会分离其采样器并触发 `sched_reserve()`；重新创建调度器还会销毁其分配器和计算缓冲区，包括锁页主机缓冲区**[^pinned]。`cudaMallocHost` 与 `cudaFreeHost` 恰好成对出现 **33 次**（第 1 批 32 条请求结束时各自触发释放与重建），每次向 CUDA 驱动申请和释放锁页主机内存合计耗时约 `42.8 ms`，<mark>仅第 1 批就在正式窗口内空耗了 1.414 s 的驱动分配时间，把 `sched_reserve` 累计推高到 1.435 s</mark>。这正是上一步「去掉了 `2.14 s` 采样空档，却只看到 `2.558 s` 总空档」的原因——省下来的时间被新引入的调度器重建抵消了大半。

[^pinned]: **锁页主机内存（Pinned Host Memory）**：锁定在物理内存页中、不会被操作系统换出到磁盘的 CPU 内存。显卡通过 DMA 直接从锁页内存拷贝数据比普通分页内存快得多，但向驱动反复申请（`cudaMallocHost`）和释放（`cudaFreeHost`）每次耗时可达数十毫秒，必须在初始化阶段分配后长期复用。

先设置诊断环境变量 `GGML_CUDA_NO_PINNED=1` 临时关闭锁页内存做对照实验，八批总耗时立刻从 `70.847 s` 降至 **`60.880 s`**，证实阻塞源头正是锁页缓冲区反复销毁重建。直接禁用锁页内存会牺牲正常的 DMA 传输加速，因此正确的优化方案是**跨请求保留既有调度器，并补齐节点容量上限保护**：在 `sched_reserve()` 中检查 `parallel` 与算子卸载配置是否不变、且所需节点容量未超过既有上限，只要容量足够就复用原调度器及其分配器与锁页计算缓冲区，仅当计算图所需节点数增长超出上限时才重建；同时完整保留图失效、同步、分配规划与多卡流并行回退逻辑，并新增 `test_sampler_buffer_reuse` 回归测试覆盖采样器移除、替换、图容量增长及全部清空后回退 logits 的场景。

优化后在保持锁页主机内存开启的前提下，第 1 批正式窗口内的 `cudaMallocHost` / `cudaFreeHost` 调用直接归零（`33/33 → 0/0`），全生命周期轨迹也确认锁页内存在预热前完成分配、运行结束后才统一释放；`sched_reserve` 累计耗时从 `1.435 s` 降至 **`0.042 s`**，窗口 GPU 空档从 `2.516 s` 降至 **`1.076 s`**。三轮完整八批（256 条请求、133966 tokens）平均耗时从 **`70.554 s` 降至 `59.157 s`**（降幅 **`16.15%`**），`wikitext-2` 困惑度保持 `14.7147 +/- 1.51865` 完全不变，CPU 与 CUDA 后端共 22 项采样器测试及 `test-alloc` 全部通过。第 1 批（32 并发、输出 `17085` tokens）优化前后的实测原始输出如下：

```text
=== OPTIMIZATION BEFORE (batch 1) ===
baseline: warmup 8.865010s, 32/32 exact
baseline: batch 1 8.755685s
baseline: TOTAL 8.755685s, 17085 tokens, 32/32 exact
=== OPTIMIZATION AFTER (batch 1) ===
patched: warmup 7.439345s, 32/32 exact
patched: batch 1 7.312512s
patched: TOTAL 7.312512s, 17085 tokens, 32/32 exact
```

单批耗时从 `8.756 s` 降至 `7.313 s`（降幅 **`16.48%`**），与全量八批三轮平均降幅一致，完整串联起 `286.875 s → 165.632 s → 73.648 s → 59.157 s`（累计提速约 **`4.85` 倍**）的四层性能定位与优化闭环。基于上述完整定位与验证，我们将该方案整理并提交了上游 PR：[llama : reuse scheduler buffers across requests (#31841)](https://github.com/ggml-org/llama.cpp/pull/31841)。

## 入门动手实战

完成机制梳理与案例剖析后，下面从空白 Linux 实验目录出发，使用单张 NVIDIA GPU 与 `vLLM` 完成一次轻量级的在线压测、PyTorch Profiler 动态抓窗与 Trace GPU 活跃率核算，动手复现前文的延迟指标分解与算子占比统计。

### 环境搭建

**先创建独立目录与 Python 虚拟环境，再按步骤安装 `vLLM` 并确认 GPU 驱动就绪，避免依赖污染系统环境。**

仅假定本机已安装基础 NVIDIA 驱动、CUDA 工具链与 Python 3。先创建实验工作目录、`traces` 输出目录以及隔离的虚拟环境：

```bash
# 1. 创建独立实验目录与 Trace 保存子目录
mkdir -p ~/compute_factory_lab/measurement/traces
cd ~/compute_factory_lab/measurement

# 2. 创建并激活独立 Python 虚拟环境
python3 -m venv .venv
source .venv/bin/activate
```

- **环境隔离**：把实验工具链装进 `.venv` 可以避免与系统全局 PyTorch 或 CUDA 包版本冲突；`traces` 目录专门接收服务端的 `.pt.trace.json.gz` 文件。

接着安装 `vLLM` 并核查当前可见 GPU 与 CUDA 编译器路径：

```bash
# 升级包管理器并安装推理框架 vLLM
pip install -U pip vllm

# 检查单卡显存容量及 CUDA 工具链（确保 nvcc 在 PATH 中可用）
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
which nvcc || echo "提示：若离线编译算子需要 nvcc，请按本机路径导出 CUDA_HOME 与 PATH"
```

- **依赖检查**：安装完成后即可直接使用 `vllm serve` 与 `vllm bench serve`；若在离线或自定义 CUDA 路径环境运行，按本机安装目录提前设置 `CUDA_HOME` 即可。

### 压测与 Trace 采集

**在终端 1 启动带 Profiler 配置的在线推理服务，在终端 2 先热身再发送带 `--profile` 的并发压测，把采样窗口严格锁在稳态期间。**

在**终端 1** 启动模型服务（若使用本地离线权重，将 `MODEL_PATH` 替换为本机实际路径，如 `/path/to/models/Qwen3-0.6B`；联网环境也可直接使用 `"Qwen/Qwen3-0.6B"`）：

```bash
# 指定模型标识或本地权重目录（请按本机环境修改路径）
export MODEL_PATH="Qwen/Qwen3-0.6B"

# 启动 OpenAI 兼容 HTTP 服务并挂载 PyTorch Profiler 输出目录
vllm serve "$MODEL_PATH" \
  --served-model-name Qwen/Qwen3-0.6B \
  --dtype bfloat16 \
  --max-model-len 2048 \
  --gpu-memory-utilization 0.75 \
  --port 8000 \
  --profiler-config '{"profiler":"torch","torch_profiler_dir":"./traces","torch_profiler_with_stack":false}'
```

- **关键参数说明**：`--profiler-config` 只注册输出路径与采样开关，不会在模型加载阶段就记录 Trace；等待终端打印就绪日志后再开启终端 2 压测。

在**终端 2** 激活同一虚拟环境，先等待健康检查通过，再发出一批小规模热身请求（丢弃冷启动与图编译耗时）：

```bash
cd ~/compute_factory_lab/measurement && source .venv/bin/activate

# 轮询健康检查端口，确保引擎完全初始化后再压测
until curl -sf "http://127.0.0.1:8000/health" > /dev/null; do sleep 1; done

# 发送 16 条短请求完成预热，触发 CUDA 上下文与图捕获进入稳态
vllm bench serve --backend openai --base-url http://127.0.0.1:8000 \
  --model Qwen/Qwen3-0.6B --dataset-name random \
  --random-input-len 256 --random-output-len 64 --ignore-eos \
  --num-prompts 16 --max-concurrency 8 --seed 42 > /dev/null
```

- **为什么要单独热身**：首次请求会包含分配缓冲区或动态编译耗时，不先热身会同时污染 `P99 TTFT` 与即将录制的 Profiler 时间线。

热身结束后，执行带 `--profile` 标记的并发 `C = 8` 正式压测（固定 `512 → 128`，SLO 设为 `TTFT ≤ 200 ms` 且 `TPOT ≤ 15 ms`）：

```bash
# 正式并发压测并自动向服务端发送 /start_profile 与 /stop_profile
vllm bench serve --backend openai --base-url http://127.0.0.1:8000 \
  --model Qwen/Qwen3-0.6B --dataset-name random \
  --random-input-len 512 --random-output-len 128 --ignore-eos \
  --num-prompts 32 --max-concurrency 8 --request-rate inf \
  --percentile-metrics ttft,tpot,itl,e2el --metric-percentiles 50,95,99 \
  --goodput ttft:200 tpot:15 --seed 42 --profile
```

- **控制变量细节**：`--num-prompts 32` 保证每条并发槽位轮转 4 轮，配合 `--ignore-eos` 与 `--seed 42` 锁定总输入 `16384` 与输出 `4096` tokens；若使用本地私有模型目录，可追加 `--tokenizer "$MODEL_PATH"`。

最后在实验目录新建脚本文件 `parse_trace.py`，写入如下带注释的 Python 代码以核算合并后的 GPU 活跃率与 Top 5 Kernel：

```python
import glob, gzip, json
from collections import defaultdict

# 1. 读取最新导出的 PyTorch Profiler 压缩 Trace（注意替换成实际生成的目录）
trace_path = sorted(glob.glob("./traces/*.pt.trace.json.gz"))[0]
with gzip.open(trace_path, "rt", encoding="utf-8") as f:
    events = json.load(f).get("traceEvents", [])

# 2. 提取所有 GPU Kernel 起止微秒时间戳并求总跨度
gpu_kernels = [e for e in events if e.get("cat") == "kernel"]
t0 = min(e["ts"] for e in gpu_kernels)
t1 = max(e["ts"] + e.get("dur", 0) for e in gpu_kernels)

# 3. 区间合并：消除多 CUDA Stream 并行导致的忙碌时间重复累加
intervals = sorted((e["ts"], e["ts"] + e.get("dur", 0)) for e in gpu_kernels)
merged = []
for s, e in intervals:
    if not merged or s > merged[-1][1]:
        merged.append([s, e])
    else:
        merged[-1][1] = max(merged[-1][1], e)

busy_ms = sum(e - s for s, e in merged) / 1000.0
span_ms = (t1 - t0) / 1000.0
print(f"Trace GPU span: {span_ms:.2f} ms, busy: {busy_ms:.2f} ms, util: {busy_ms / span_ms * 100:.1f}%")

# 4. 统计各类核函数累计耗时占比，定位算子热点
by_name = defaultdict(float)
for k in gpu_kernels:
    by_name[k["name"]] += k.get("dur", 0)
total_dur = sum(by_name.values())
for name, dur in sorted(by_name.items(), key=lambda x: -x[1])[:5]:
    print(f"  {dur/1000:7.2f} ms ({dur/total_dur*100:5.1f}%): {name[:72]}")
```

- **为什么必须做区间合并**：多条 CUDA Stream 并发执行时，不同 Kernel 的时间区间会出现交叠，直接求和算出的忙碌时间会大于 `t1 - t0`，合并后才能反映真实的硬件利用率。

### 结果核对与分析

**同时读取客户端压测面板与 `parse_trace.py` 统计结果，可以把前端尾延迟数字与后端算子硬件瓶颈直接对齐。**

运行 `python parse_trace.py` 收集解析输出：

```bash
# 运行 Trace 统计脚本，打印 GPU 活跃率与前 5 大耗时算子
python parse_trace.py
```

- **预期行为**：脚本会在几秒内解析完毕并输出两段关键数字，无需人工打开几百 MB 的浏览器波形也能先完成定量体检。

以下展示一组真实执行输出（实测环境：单张 NVIDIA GeForce RTX 5070 12 GiB、CUDA 13.4、`vLLM` v1 开发环境、`TRITON_ATTN` 后端、`Qwen/Qwen3-0.6B` `bfloat16`）：

```text
...
============ Serving Benchmark Result ============
Successful requests:                     32
Failed requests:                         0
Maximum request concurrency:             8
Benchmark duration (s):                  2.12
Total input tokens:                      16384
Total generated tokens:                  4096
Request throughput (req/s):              15.08
Request goodput (req/s):                 15.08
Output token throughput (tok/s):         1930.30
Total token throughput (tok/s):          9651.51
---------------Time to First Token----------------
P50 TTFT (ms):                           48.29
P99 TTFT (ms):                           74.04
-----Time per Output Token (excl. 1st token)------
P50 TPOT (ms):                           3.73
P99 TPOT (ms):                           4.05
---------------Inter-token Latency----------------
P50 ITL (ms):                            3.71
P99 ITL (ms):                            4.24
----------------End-to-end Latency----------------
P50 E2EL (ms):                           528.65
P99 E2EL (ms):                           547.85
==================================================
...
Trace GPU span: 2113.02 ms, busy: 2070.30 ms, util: 98.0%
   673.10 ms ( 32.5%): void cutlass::Kernel2<cutlass_80_wmma_tensorop_bf16_s161616gemm_bf16_16x
   530.46 ms ( 25.6%): void cutlass::Kernel2<cutlass_80_wmma_tensorop_bf16_s161616gemm_bf16_16x
   493.51 ms ( 23.8%): kernel_unified_attention
   166.12 ms (  8.0%): void cutlass::Kernel2<cutlass_80_tensorop_bf16_s16816gemm_relu_bf16_64x6
    42.67 ms (  2.1%): _topk_topp_kernel
```

**执行结果分析**：
1. **端到端延迟与 Goodput 验证**：`32/32` 请求全部命中 `TTFT ≤ 200 ms` 与 `TPOT ≤ 15 ms`，因此 `Request goodput`（`15.08 req/s`）等于总请求吞吐；代入式 (1) 验算 P50 耗时 `48.29 + 127 × 3.73 = 522.00 ms`，与实测 `528.65 ms` 高度吻合，且 `P99 ITL`（`4.24 ms`）与 `P50 ITL`（`3.71 ms`）贴近，说明 `C = 8` 并发下没有出现严重的排队抢占毛刺。
2. **GPU 活跃率与算子热点验证**：整个 `2113.02 ms` 采样窗口内 GPU 有效忙碌达 `2070.30 ms`（活跃率 `98.0%`），几乎没有 CPU 发射空档；时间主体完全集中在三类 CUTLASS 矩阵乘（合计占 `66.1%`）与统一注意力核函数 `kernel_unified_attention`（`23.8%`），采样算子 `_topk_topp_kernel` 仅占 `2.1%`，证明前序调优链路在正常服务下完全成立。
3. **常见异常排查方向**：若 `Failed requests` 大于 0，先核对服务终端日志中的模型名是否与 `--model` 一致，并确认 `--max-model-len` 不小于测试的输入与输出长度之和；若测得 GPU 活跃率远低于 `70%`，先检查是否遗漏开启 CUDA Graph 或压测前未充分预热。

## 小结

- **指标与接口决定观测真伪**：TTFT 看首字、ITL 抓卡顿、Goodput 守住 P99 红线；在线接口的 Chat Template 词元膨胀与 SSE 推送间隔会直接改写测得的吞吐与延迟，不可与离线纯引擎吞吐混比。
- **压测靠控制变量立住可比性**：固定预热、开环到达模型（警惕闭环压测的协同遗漏）、输出长度分布与随机种子，才能把并发膝点与架构收益测准。
- **按工具阶梯逐层定位根因**：`nsys` 负责系统时间线、GPU 空档与 CUDA API 异常；`PyTorch Profiler` 负责映射 Python 算子与融合机会；`ncu` 负责界定单核函数的 SM/DRAM 屋顶线；当出现难以归因的 GPU 空档时，用 `gperftools` + NVTX 阶段交集把空白还原成具体宿主函数（如案例中的词表采样与固定页缓冲区重建）。

完成瓶颈测量与定位后，下一章将进入《缓存与调度优化》，针对高并发与长上下文下观测到的 Prefill 抢占毛刺与 KV 访存压力，系统拆解 PagedAttention、Continuous Batching、Chunked Prefill 与前缀缓存的实现机制。

## 延伸阅读

- [vLLM `bench serve` 官方文档](https://docs.vllm.ai/en/latest/cli/bench/serve/)：在线压测命令行参数、百分位统计与 `--goodput` 用法说明。
- [GuideLLM (vllm-project/guidellm)](https://github.com/vllm-project/guidellm)：面向生产 SLO 扫频与饱和拐点探测的基准测试工具。
- [SGLang Benchmark and Profiling 文档](https://docs.sglang.io/docs/developer_guide/benchmark_and_profiling)：四层压测工具划分、PyTorch Profiler、`/start_profile` 动态抓窗与层级 NVTX 实操指南。
- [DistServe 论文 (OSDI '24 / arXiv:2401.09670)](https://arxiv.org/abs/2401.09670)：Goodput 定义与 Prefill/Decode 相互干扰分析的一手来源。
- [PyTorch Profiler 官方配方](https://docs.pytorch.org/tutorials/recipes/recipes/profiler_recipe.html)：`torch.profiler` 采集参数、Chrome Trace 导出与内存追踪说明。
- [NVIDIA Nsight Systems 用户指南](https://docs.nvidia.com/nsight-systems/UserGuide/index.html) 与 [Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html)：系统时间线交互抓窗与单 Kernel SOL/Roofline 分析官方文档。
- [llama.cpp PR #31841](https://github.com/ggml-org/llama.cpp/pull/31841)：实战案例中跨请求复用调度器与锁页计算缓冲区的源码修复与实测记录。
- [zero-to-sglang · Part I 第 5 章 Benchmark 入门](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part1/%E7%AC%AC5%E7%AB%A0_Benchmark%E5%85%A5%E9%97%A8.md)：推理基准指标直觉与常见测试误区参考课程。
