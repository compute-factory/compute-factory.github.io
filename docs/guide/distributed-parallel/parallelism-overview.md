---
title: 分布式并行概览
description: 先建立全局地图：为什么需要分布式并行、常见有哪些并行技术、训练与推理为什么诉求不同。
---

# 分布式并行概览

当大语言模型从十亿参数迈向百亿与千亿规模时，单张 GPU 在计算耗时与显存容量两个维度上都会触及物理上限。作为「分布式并行」板块的开篇导读，本章不涉及具体的切分选型配方或复杂的算子实现，而是先帮你建立一张清晰的**全局概念地图**：搞清楚为什么单卡跑不动大模型、工程上常见有哪些并行技术、这些技术各自切分的是什么，以及为什么训练和推理在并行诉求上存在根本差异。本章以一个标准的 **70B 稠密 Transformer 模型**（80 层，单卡显存基准 $80\text{ GB}$）作为贯穿算例，带你走完分布式并行的核心概念全景。

## 为什么需要分布式并行

为什么无法在一张 $80\text{ GB}$ 显存的数据中心 GPU 上直接完成 70B 模型的训练或高并发长上下文推理？把训练总计算量与单步显存账本拆开核算，单卡的物理瓶颈会立刻呈现为「算力墙」与「显存墙」两种形态。

### 算力墙与训练耗时瓶颈

**单卡有效吞吐无法在工程可接受的周期内消化百亿模型与万亿词元的乘法级算力需求。**

首先明确衡量硬件计算效率的两个基础概念：

- **每秒浮点运算次数（Floating Point Operations Per Second, FLOP/s）**：硬件每秒执行的浮点加乘运算上限，用于度量加速器的理论峰值算力；不带时间分母的 `FLOPs` 则表示完成一次任务所需的累计浮点运算总量。
- **模型算力利用率（Model FLOPs Utilization, MFU）**：由 PaLM 论文（[Chowdhery et al., 2022](https://arxiv.org/abs/2204.02311)）定义的系统效率指标，等于「完成模型计算所需的理论最小浮点运算量除以硬件在相同时间内的标称峰值算力」。在训练阶段，每词元的理论最小算力包含 **1 次前向传播（$2P$）与 1 次反向传播（$4P$）共 $6P$**；MFU 排除的是为了节省显存而在反向阶段**额外重跑一遍前向传播**的激活重计算等系统开销，并非排除正常的反向求导。

对于参数量为 $P$、训练词元（Token）总数为 $D$ 的稠密 Transformer 模型，完成一轮预训练所需的理论总计算量约为 $6 \cdot P \cdot D$。设集群共有 $N$ 张 GPU，单卡峰值算力为 $F_{\text{peak}}$，实测模型算力利用率为 $\text{MFU}$，则预训练总耗时 $T_{\text{train}}$ 的核心估算公式为：

$$
T_{\text{train}} = \frac{6 \cdot P \cdot D}{N \cdot F_{\text{peak}} \cdot \text{MFU}} \tag{1}
$$

以 $P = 70 \times 10^9$（70B 参数）、$D = 1 \times 10^{12}$（1T Token）为例，总计算量高达 $4.2 \times 10^{23}\text{ FLOPs}$。即便在一张峰值算力 $F_{\text{peak}} = 1000\text{ TFLOP/s}$ 的数据中心 GPU 上稳定跑出 $\text{MFU} = 50\%$ 的高效率，<mark>单卡不间断运行也需要约 26.6 年才能跑完 1T Token</mark>；只有借助分布式并行横向扩展到 $1024$ 张卡协同计算，训练周期才能压缩到约 $9.5$ 天。

::: details 点击展开：70B 模型 1T Token 预训练耗时的分步推演

按公式 $(1)$ 代入 $P = 7 \times 10^{10}$、$D = 10^{12}$、$F_{\text{peak}} = 10^{15}\text{ FLOP/s}$ 与 $\text{MFU} = 0.5$：

$$
\begin{aligned}
C_{\text{total}} &= 6 \cdot P \cdot D && \text{（前向2PD+反向4PD）} \\
&= 6 \times (7 \times 10^{10}) \times 10^{12} && \text{（代入70B与1T词元）} \\
&= 4.2 \times 10^{23}\text{ FLOPs} && \text{（单轮总浮点运算量）} \\
F_{\text{eff,1}} &= F_{\text{peak}} \cdot \text{MFU} && \text{（单卡有效持续算力）} \\
&= 10^{15} \times 0.5 && \text{（按50\%利用率折算）} \\
&= 5.0 \times 10^{14}\text{ FLOP/s} && \text{（每秒消化浮点次数）} \\
T_{\text{1-GPU}} &= \frac{C_{\text{total}}}{F_{\text{eff,1}}} && \text{（单卡持续运行秒数）} \\
&= \frac{4.2 \times 10^{23}}{5.0 \times 10^{14}} && \text{（代入总算力与吞吐）} \\
&= 8.4 \times 10^{8}\text{ s} && \text{（换算前总秒数）} \\
&\approx 26.64\text{ 年} && \text{（按每年31536000秒计）} \\
T_{\text{1024-GPU}} &= \frac{T_{\text{1-GPU}}}{1024} && \text{（千卡线性扩展秒数）} \\
&\approx 9.50\text{ 天} && \text{（按每天86400秒折算）}
\end{aligned}
$$

:::

### 显存墙与训推状态账本

**在撞上算力墙之前，模型静态状态与动态缓存的字节数早已超出单卡高带宽显存的物理上限。**

训练与推理的显存占用由两类数据构成：一类是与输入批次无关的**静态状态**（权重、梯度、优化器状态），另一类是随批次大小 $B$ 和序列长度 $S$ 动态增长的**中间数据**（训练时的前向激活值、推理时的键值缓存 KV Cache）。在现代大模型普遍采用的**混合精度训练**（Mixed-Precision Training）中，前向与反向计算使用 2 字节的 `BF16` 权重和 `BF16` 梯度，而 **AdamW 优化器**为了保证参数更新精度，需要额外维护 4 字节的 `FP32` 主权重、4 字节的一阶动量 $m$ 和 4 字节的二阶方差 $v$（合计每参数 12 字节优化器状态，详见 [ZeRO, Rajbhandari et al., 2020](https://arxiv.org/abs/1910.02054)）。

![单卡瓶颈的两种形态：算力墙与显存墙（以 70B 稠密模型为例）](/images/distributed-parallel/parallelism-overview/single-card-walls.svg)
*图 1：70B 稠密模型在单卡上的算力墙（左栏耗时链）与显存墙（右栏 80 GB 基准线与训推显存对比）。*

对照图 1 右栏的显存刻度，70B 模型在单卡 $80\text{ GB}$ 基准线（绿色虚线）面前呈现出巨大的容量缺口：

1. **推理阶段的显存门槛（图 1 右栏中部蓝色与紫色条）**：推理不需要反向求导，没有梯度和优化器状态。但 70B 参数按 `BF16`（2 字节/参数）存放，仅只读权重就占去 $140\text{ GB}$，单卡连模型权重都加载不进去；当并发批次 $B=32$、序列长度 $S=8192$ 时，键值缓存（KV Cache）还需额外占用约 $86\text{ GB}$，总显存需求达 $226\text{ GB}$（超过单卡容量的 $2.8$ 倍）。
2. **训练阶段的 $16P$ 静态账本（图 1 右栏下部三色长条）**：把 `BF16` 权重（$2\text{ B}$）、`BF16` 梯度（$2\text{ B}$）与 `FP32` AdamW 状态（$12\text{ B}$）加总，训练静态状态开销遵循 **$16P$ 字节定律**：

$$
M_{\text{static, train}} = 16P \text{ 字节} \tag{2}
$$

按公式 $(2)$ 计算，<mark>70B 模型的训练静态状态高达 $1120\text{ GB}$，是单卡 $80\text{ GB}$ 显存的 14 倍</mark>，且这还没有计入前向传播为反向求导保留的各层激活值。下表汇总了 70B 模型在训练与推理下的显存分项对比：

| 显存分项 | 每参数字节数 | 70B 混合精度训练占用 | 70B `BF16` 推理占用（$B=32, S=8192$） | 生命周期与系统属性 |
| :--- | :--- | ---: | ---: | :--- |
| 模型权重（Weights） | $2\text{ B}$（`BF16`） | $140\text{ GB}$ | $140\text{ GB}$ | 全程常驻；训练可更新，推理只读 |
| 梯度（Gradients） | $2\text{ B}$（`BF16`） | $140\text{ GB}$ | $0\text{ GB}$ | 反向传播生成，参数更新后清零 |
| 优化器状态（AdamW + 主权重） | $12\text{ B}$（`FP32`） | $840\text{ GB}$ | $0\text{ GB}$ | 训练全程常驻，独占静态显存的 $75\%$ |
| **静态状态小计** | **训练 $16\text{ B}$ / 推理 $2\text{ B}$** | **$1120\text{ GB}$** | **$140\text{ GB}$** | **与输入批次 $B$ 和序列长度 $S$ 无关** |
| 动态中间态（激活值 / KV Cache） | 随 $B \cdot S$ 增长 | 数十至数百 $\text{GB}$ | 约 $86\text{ GB}$ | 训练存各层前向激活；推理存历史 KV Cache |

::: details 点击展开：70B 模型训练静态显存与推理 KV Cache 的分步算式

设模型参数量 $P = 70 \times 10^9$，层数 $L = 80$，注意力键值头数 $n_{kv} = 8$，单头维度 $d_h = 128$，推理批次 $B = 32$，序列长度 $S = 8192$，精度为 `BF16`（2 字节/元素）：

$$
\begin{aligned}
M_{\text{weights}} &= 2 \cdot P && \text{（BF16每参数2字节）} \\
&= 2 \times 70 \times 10^9 && \text{（代入70B参数量）} \\
&= 140\text{ GB} && \text{（只读权重静态体积）} \\
M_{\text{grad}} &= 2 \cdot P && \text{（BF16梯度同为2字节）} \\
&= 140\text{ GB} && \text{（反向梯度静态体积）} \\
M_{\text{opt}} &= (4 + 4 + 4) \cdot P && \text{（主权重+动量m+方差v）} \\
&= 840\text{ GB} && \text{（每参数12字节FP32）} \\
M_{\text{static, train}} &= M_{\text{weights}} + M_{\text{grad}} + M_{\text{opt}} && \text{（训练静态状态总和）} \\
&= 140 + 140 + 840 && \text{（三项静态状态相加）} \\
&= 1120\text{ GB} && \text{（训练静态显存总账）} \\
M_{\text{KV}} &= 2 \cdot L \cdot B \cdot S \cdot n_{kv} \cdot d_h \cdot 2 && \text{（K与V两矩阵×2字节）} \\
&= 4 \times 80 \times 32 \times 8192 \times 8 \times 128 && \text{（代入70B GQA参数）} \\
&= 85,899,345,920\text{ B} && \text{（精确字节数，即80 GiB）} \\
&\approx 85.90\text{ GB} && \text{（按十进制GB折算）}
\end{aligned}
$$

:::

## 常见的分布式并行技术

既然单卡既装不下模型状态、也算不完海量数据，就必须把数据和模型切分到多张 GPU 上协同工作。面对繁多的分布式并行缩写，如何建立一套不重不漏的分类框架？

### 五维并行分类全景

**主流分布式并行技术可以归纳为「数据、张量、流水线并行、上下文、专家」五个正交维度，分别对应对输入批次、单层矩阵宽度、模型层深度、序列长度与稀疏专家子网的切分。**

参考 Hugging Face [The Ultra-Scale Playbook](https://huggingface.co/spaces/nanotron/ultrascale-playbook) 与 NVIDIA [Megatron Core Parallelism Guide](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html)，这五类切分技术共同构成了现代大模型的五维并行（5D Parallelism）体系：

![分布式并行的五个基本维度：切什么、换来什么、通信什么](/images/distributed-parallel/parallelism-overview/five-parallel-dimensions.svg)
*图 2：分布式并行的五个基本维度（DP/ZeRO、TP/SP、PP、CP、EP）的切分对象与底层通信方式概览。*

### 五种典型并行方式简介

对照图 2 的五张卡片，我们先从宏观上认识每种并行技术「切的是什么」（每种技术的具体实现、通信量推导与代码实验将在后续第 03～07 章逐一拆解）：

#### 数据并行与状态分片（DP / ZeRO）

- **数据并行（Data Parallelism, DP）**：按**输入批次样本**（Batch）切分。每张 GPU 拿一部分样本独立算前向和反向，每步结束时把各卡算出的梯度汇总求平均。
- **零冗余优化器（ZeRO）与完全分片数据并行（FSDP）**：传统 DP 要求每张卡都完整存一份 $16P$ 状态；ZeRO / FSDP 则把优化器状态、梯度和权重按卡数拆开均分存放，算到哪一层时再临时跨卡拼齐权重，从而在扩充吞吐的同时把静态显存按卡数线性降下来（详见第 03 章《数据并行》）。

#### 张量并行与序列并行（TP / SP）

- **张量并行（Tensor Parallelism, TP）**：进入**单个 Transformer 层内部**，把单个大权重矩阵按列或按行切开分给多张 GPU，让多张卡同时计算同一个矩阵乘法的不同分块，算完立即在层内汇总结果（[Megatron-LM, Shoeybi et al., 2019](https://arxiv.org/abs/1909.08053)）。
- **序列并行（Sequence Parallelism, SP）**：作为 TP 的配套机制，把层归一化（`LayerNorm`）等未被 TP 切分的激活值按序列长度切开分摊。<mark>TP 与 SP 配合能同时削减单层权重、状态和激活显存，但因为每一层内部都要频繁同步，对卡间互联带宽要求最高</mark>（详见第 04 章《张量与序列并行》）。

#### 流水线并行（PP）

- **流水线并行（Pipeline Parallelism, PP）**：沿着**模型的层数深度**（Depth）切分。例如把 80 层模型按顺序切成 4 个阶段（Stage），4 张卡（或 4 台机器）分别负责第 $1\sim 20$ 层、$21\sim 40$ 层、$41\sim 60$ 层和 $61\sim 80$ 层，前一段算完只把交界处的输出传给下一段。它的通信量极小，核心挑战在于如何通过微批次调度减少下游等待上游的空闲时间——即**流水线并行气泡（Pipeline Bubble）**（详见第 05 章《流水线并行》）。

#### 上下文并行（CP）

- **上下文并行（Context Parallelism, CP）**：专为超长文本（如 $32\text{K} \sim 128\text{K}$ 以上上下文）设计，沿着**输入序列长度**（Sequence Length）将整条长序列切成多段分给不同 GPU。各卡在线性层上各自处理本地那一段词元，只在注意力层计算时跨卡交换键值（KV）分块，从而把单条长序列的激活值与 KV Cache 显存按卡数均摊（详见第 06 章《上下文并行》）。

#### 专家并行（EP）

- **专家并行（Expert Parallelism, EP）**：专为**混合专家模型**（Mixture-of-Experts, MoE）设计。MoE 层拥有数十乃至上百个并列的专家子网络（FFN），但每个词元只路由激活其中少数几个专家；EP 把不同专家分散放置在不同 GPU 上，计算时通过全对全通信（`All-to-All`）把词元发送到目标专家所在的 GPU 处理，算完再发回原卡（详见第 07 章《专家并行》）。

### 多维并行的正交组合与通信底座

**在实际集群中，上述五种并行技术并非非此即彼，而是作为正交坐标轴叠加组成多维设备网格（Device Mesh），并通过底层集合通信原语与高速互联网络协同工作。**

在稠密大模型系统中，张量并行（TP）、上下文并行（CP）、流水线并行（PP）与数据并行（DP）四个维度彼此独立，集群总卡数（World Size）等于各维度并行度的乘积：

$$
N_{\text{world}} = N_{\text{tp}} \times N_{\text{cp}} \times N_{\text{pp}} \times N_{\text{dp}} \tag{3}
$$

![Llama 3 405B 预训练的四维并行切分拓扑示意](/images/distributed-parallel/parallelism-overview/llama3-4d-parallelism.png)
*图 3：Llama 3 预训练使用的 4D 并行设备网格拓扑（顺序为 `[TP, CP, PP, DP]`，图中以各维度并行度均为 2 的 16 卡网格为例）。来源：[Meta Llama 3 Herd of Models 原论文 Figure 5](https://arxiv.org/abs/2407.21783)（亦收录于 [Hugging Face The Ultra-Scale Playbook](https://huggingface.co/spaces/nanotron/ultrascale-playbook)）。*

对照图 3 的 16 卡网格示例，每张 GPU 都处于四条并行轴的交点上：以左下角前排的 `GPU 0` 为例，它与横向的 `GPU 1` 组成 **TP 组**（合算同一层矩阵），与后排的 `GPU 2` 组成 **CP 组**（合拼一条长序列），与下层的 `GPU 4` 组成 **PP 组**（上下接力不同层），并与右侧的 `GPU 8` 组成 **DP 组**（同步梯度分片）。

只要把模型或数据切开，各卡之间就必须交换数据。这些跨卡数据交换依赖两层基础设施（将在下一章第 02 章《通信原语与硬件拓扑》中专门讲解）：
1. **集合通信原语（Collective Communication）**：如汇总求和的 `AllReduce`、收集分片的 `AllGather`、规约并分发的 `ReduceScatter` 以及全对全路由的 `All-to-All`。
2. **多级物理互联硬件**：包括机器内部高速直连的 **NVLink / NVSwitch**（双向带宽数百 $\text{GB/s}$）、机内标准 **PCIe 总线**（单向数十 $\text{GB/s}$），以及跨机器的 **RDMA 高速网络（InfiniBand / RoCE）**。

下表汇总了五种常见并行技术的切分对象与本板块后续专章的对应关系：

| 并行技术 | 切分对象 | 核心作用一句话概括 | 对应后续专章 |
| :--- | :--- | :--- | :--- |
| **DP / ZeRO（FSDP）** | 批次样本 + 模型状态副本 | 多卡并行处理不同样本，并均摊 $16P$ 训练状态显存 | 第 03 章（数据并行） |
| **TP（+ SP）** | 单个层内的权重矩阵与激活 | 多卡合算同一层矩阵乘法，削减单层显存并聚合带宽 | 第 04 章（张量与序列并行） |
| **PP** | 模型的层数深度（Stage） | 按层分段接力计算，以极小通信量跨机器容纳超大模型 | 第 05 章（流水线并行） |
| **CP** | 输入序列长度（Sequence） | 把超长文本切成多段，分摊长上下文激活与 KV Cache | 第 06 章（上下文并行） |
| **EP** | MoE 层的稀疏专家子网 | 把不同专家放到不同 GPU 上，分摊 MoE 海量专家权重 | 第 07 章（专家并行） |

## 训练与推理的并行诉求差异

同样面对上述五种并行工具，为什么分布式训练和分布式推理在使用它们时关注点截然不同？

### 训练与推理的系统目标对比

**训练与推理的并行差异，根源在于训练追求的是「高吞吐下装下 $16P$ 状态与全套反向激活」，而推理追求的是「在毫秒级交互延迟约束下加快只读权重读取并容纳高并发 KV Cache」。**

对比两者的运行过程，存在三处关键区别：

1. **显存账本差出近十倍**：训练必须同时保存权重、梯度、优化器状态（$16P$，70B 需 $1120\text{ GB}$）以及所有层的前向激活值（供反向求导使用）；推理只需保存只读权重（$2P$，70B 需 $140\text{ GB}$），算完一层即可丢弃上一层激活，剩余显存全部用于存放键值缓存（KV Cache）。
2. **吞吐导向 vs 延迟导向**：训练是离线批处理任务，单步迭代耗时数秒完全可接受，核心目标是让集群每秒处理的总词元吞吐（Tokens/s）最大化；在线推理直接服务实时用户，必须严格控制**首词元延迟**（Time To First Token, TTFT）与**单步解码输出延迟（Time Per Output Token, TPOT）**。
3. **推理独有的两阶段特征**：训练的前向和反向全是大矩阵乘法，属于典型的算力受限（Compute-bound）；而推理分为算力受限的**预填充阶段**（Prefill，一次并行算完用户输入整段提示词）与显存带宽受限的**解码阶段（Decode，每步只生成 1 个新词元，却要把全部模型权重从显存读入计算核心一次）**。

### 训练侧与推理侧的并行侧重点

**训练侧重点用状态分片与重计算「拿通信和算力换显存」，推理侧则要求权重常驻显存、重点用张量并行与阶段分离「聚合显存带宽降延迟」。**

正是因为系统目标不同，训练和推理对并行技术的使用方式产生了鲜明分野（具体选型配方与工程落地将在第 08～10 章深入展开）：

- **训练侧普遍用 ZeRO / FSDP 动态拉取权重，推理侧则让权重静态常驻**：训练单步计算量极大（大 Batch 乘长序列），单层计算耗时足以在后台掩盖跨卡拉取下一层权重分片的通信时间，因此 ZeRO / FSDP 和**激活重计算**（Activation Recomputation）是训练标配；而在线推理解码（Decode）每生成一个词元只有十几个毫秒的预算，绝不能在每步生成时跨网络临时拉取百吉字节的权重，必须将切分后的权重静态常驻在各卡显存中。
- **机内张量并行（TP）在推理中直接承担「加速解码」的核心角色**：在训练中，TP 主要是为了切开单卡装不下的超大层；而在推理的 Decode 阶段，<mark>将模型按 TP 切到多张 GPU 上不仅分摊了权重和 KV Cache 容量，更相当于把单次读权重的有效显存带宽放大了多倍，从而直接缩短每步吐字延迟（TPOT）</mark>。
- **推理独有的预填充与解码分离（PD 分离）**：由于推理的 Prefill 缺算力、Decode 缺显存带宽，现代分布式推理系统（如 vLLM、SGLang，详见 [DistServe, Zhong et al., 2024](https://arxiv.org/abs/2401.09670)）常将集群拆分为专门跑 Prefill 的实例池与专门跑 Decode 的实例池，让两个阶段各自采用最匹配的并行方式，互不阻塞。

## 小结

本章为你勾勒了分布式并行的全局蓝图，核心要点可归纳为三条主线：

1. **为什么需要分布式并行**：百亿与千亿大模型在单卡上同时面临**算力墙**（单卡跑完 70B 1T Token 预训练需二十余年）与**显存墙**（70B 推理只读权重需 $140\text{ GB}$，混合精度训练静态状态按 $16P$ 定律高达 $1120\text{ GB}$），必须依靠多卡切分突破显存上限、依靠并行计算缩短训练与响应耗时。
2. **常见有哪些并行技术**：围绕模型与数据的五个正交维度，形成了 **数据并行与状态分片（DP/ZeRO，切样本与状态）**、**张量与序列并行（TP/SP，切层内矩阵与激活）**、**流水线并行（PP，切模型层深度）**、**上下文并行（CP，切长序列长度）** 与 **专家并行（EP，切 MoE 稀疏专家）** 五大技术，它们可正交叠加为多维设备网格。
3. **训练与推理为什么诉求不同**：训练背负 $16P$ 状态与多层激活、以总吞吐为目标，侧重用状态分片与重计算换取显存空间；推理仅存 $2P$ 只读权重与 KV Cache、以低延迟为目标，侧重让权重常驻显存，通过张量并行聚合多卡显存带宽并配合 Prefill/Decode 阶段分离。

顺着这张地图，「分布式并行」板块接下来的章节将按如下脉络层层推进：
- **底层底座（第 02 章）**：先在《通信原语与硬件拓扑》中看懂 `AllReduce`、`AllGather`、`ReduceScatter`、`AllToAll` 四大通信原语与 NVLink、PCIe、RDMA 硬件拓扑；
- **五大并行逐一拆解（第 03～07 章）**：依次深入《数据并行》《张量与序列并行》《流水线并行》《上下文并行》与《专家并行》的内部机制与代码验证；
- **横向对比与实战落地（第 08～10 章）**：在掌握全部五种并行后，于《并行方案比较与应用场景》中系统讲解不同硬件与模型规模下的切分选型配方，最后进入《分布式推理实践》与《分布式训练实践》。

## 延伸阅读

- [The Ultra-Scale Playbook: Training LLMs on GPU Clusters](https://huggingface.co/spaces/nanotron/ultrascale-playbook)：Hugging Face Nanotron 团队编写的开源手册，从单卡显存账本出发直观梳理了 5D 并行的概念演进。
- [How To Scale Your Model (Google DeepMind Scaling Book)](https://jax-ml.github.io/scaling-book/)：系统介绍算力墙、显存墙、硬件通信底座以及训练与推理并行范式差异的权威公开课教材。
- [NVIDIA Megatron Core Developer Guide — Parallelism Guide](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/parallelism-guide.html)：Megatron-Core 官方文档对 TP、SP、PP、CP、EP 与 FSDP 的概念界定。
- [vLLM Documentation — Parallelism and Scaling](https://docs.vllm.ai/en/latest/serving/parallelism_scaling.html)：vLLM 官方文档对分布式推理中 TP、PP、DP 与 EP 定位的介绍。
- [ZeRO: Memory Optimizations Toward Training Trillion Parameter Models (Rajbhandari et al., SC 2020)](https://arxiv.org/abs/1910.02054)：第 2 节清晰拆解了大模型训练的 $16P$ 静态状态显存账本与激活值开销。
- [The Llama 3 Herd of Models (Dubey et al., 2024)](https://arxiv.org/abs/2407.21783)：第 3.3 节展示了 `[TP, CP, PP, DP]` 四维并行网格在超大规模训练集群中的组合形态。
