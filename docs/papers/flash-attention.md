---
title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"
description: 精读 Dao 等人的 FlashAttention 论文（arXiv:2205.14135v2），解析分块、在线 Softmax 换基与反向重算如何把精确注意力的显存占用压到线性并加速训练。
---

# FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness {#flashattention-以分块与在线-softmax-消除注意力矩阵的显存往返}

这篇报告精读 Tri Dao 等人的 [*FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*](https://arxiv.org/abs/2205.14135)（[arXiv:2205.14135v2](https://arxiv.org/pdf/2205.14135v2)，2022 年 6 月版）。长序列 Transformer 的核心瓶颈不在自注意力的浮点乘加次数，而在 GPU 高带宽显存与片上存储之间反复搬运 $N\times N$ 的中间矩阵。读完你将掌握三件事：为什么降低浮点运算量的近似注意力往往没有实际加速、在线 Softmax 如何在只看见局部键块时增量维护整行归一化分母、反向传播如何仅凭行统计量重算梯度。文中实验数据与图表全部取自论文 v2 原文，未在其他硬件上重跑基准测试。

## 主要工作

**FlashAttention 计算的仍是完整的 $\operatorname{softmax}(QK^{\mathsf T})V$，一个注意力位置都没有跳过；它改变的是中间结果在哪里生成、算完是否写回显存。**

算法围绕GPU两级存储设计：**高带宽显存（High Bandwidth Memory, HBM，以下简称 HBM）** 是容量达数十 GB 但带宽较低的片外主显存；**片上静态随机存取存储器（Static Random-Access Memory, SRAM，以下简称 SRAM）** 是每个流多处理器内部容量仅百余 KB 但带宽高一个数量级的片上存储（含共享内存与寄存器资源）。论文将显存层级之间的数据读写定义为 **IO（输入/输出访问）**，提出 **IO 感知（IO-aware）** 的 **精确注意力（Exact Attention）** 算法：前向计算采用 **分块（Tiling）**，在 SRAM 内分块生成局部分数并原地更新每行的最大值、指数和与部分输出，从头到尾不在 HBM 中实例化 $N\times N$ 的注意力矩阵；反向传播采用 **重算（Recomputation）**，利用前向保存的行统计量在片上按块恢复注意力概率，省去为反向传播保留平方级中间矩阵的显存开销。[论文，§1、§3.1](https://arxiv.org/pdf/2205.14135v2#page=2)

在序列长度 $N$、单头维度 $d$、片上可用容量 $M$（以标量元素个数计，$d \le M \le Nd$）的条件下，标准注意力前向需要 $\Theta(Nd + N^2)$ 次 HBM 访问，而 FlashAttention 前向需要 $\Theta(N^2 d^2 M^{-1})$ 次访问，额外显存占用从 $O(N^2)$ 降为 $O(N)$。在 A100 的端到端训练实测中，FlashAttention 将 BERT-large 训练时间比 MLPerf 1.1 记录缩短 15%（20.0 分钟降至 17.4 分钟），将 GPT-2 medium 训练时间从 Hugging Face 基线的 21.0 天缩短至 6.9 天，并让标准 Transformer 首次在序列长度 16K 的 Path-X 任务上跑通且拿到 61.4% 准确率。[论文，§1、定理 1–2、表 1–2、表 6](https://arxiv.org/pdf/2205.14135v2#page=5)

## 研究背景与问题定义

### 算术强度决定注意力卡在显存带宽而非浮点算力

**判断一个 GPU 算子受算力限制还是受显存带宽限制，看的不是总计算量，而是每读写一字节显存所能完成的浮点运算次数。**

论文以 NVIDIA A100 GPU 为例给出存储层级参数：片外 HBM 容量为 40–80 GB，带宽为 1.5–2.0 TB/s；全卡 108 个 **流多处理器（Streaming Multiprocessor, SM）** 各自拥有 192 KB 的片上 SRAM，合计带宽估计约 19 TB/s。片上 SRAM 的读写速度比 HBM 快约一个数量级，容量却小四个数量级以上。衡量操作在这两级存储上表现的指标是 **算术强度（Arithmetic Intensity）**，定义为每次显存字节访问所执行的算术运算次数。内维度较大的矩阵乘法算术强度高，耗时由 **浮点运算次数（Floating Point Operations, FLOPs，以下简称 FLOPs）** 决定，属于计算受限（compute-bound）；而逐元素操作（掩码、Dropout、激活函数）与归约操作（求和、Softmax、层归一化）每读写一个元素只做几次运算，耗时由 HBM 读写量决定，属于显存带宽受限（memory-bound）。[论文，§2.1、图 1](https://arxiv.org/pdf/2205.14135v2#page=3)

![原文图 1：左为 GPU 存储层级与 FlashAttention 的内外层分块循环，右为 GPT-2 注意力各步骤在 PyTorch 与融合内核下的耗时对比](/images/papers/flash-attention/fig1-memory-hierarchy-tiling.png)

*图 1：左图展示 CPU DRAM、GPU HBM 与 GPU SRAM 的带宽和容量对比，以及外层装入 $K,V$ 块、内层遍历 $Q$ 块的分块流程；右图对比 GPT-2 注意力（$N=1024$）在 PyTorch 标准实现与 FlashAttention 单内核融合下的正反向分项耗时。截取自[Dao 等，2022，原文图 1](https://arxiv.org/pdf/2205.14135v2#page=2)。*

加速显存受限操作的常见手段是 **算子融合（Kernel Fusion）**：把连续多个操作合并进同一个 [CUDA 内核](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)，数据从 HBM 读入 SRAM 后一口气算完，避免中间结果反复写回 HBM。但在模型训练阶段，朴素编译器融合对注意力失效：反向传播求梯度仍然需要前向的中间激活值，编译器还是得把 $N\times N$ 的中间矩阵写回 HBM 保存。此前许多近似注意力算法（稀疏近似与低秩近似）专注于把理论计算量从 $O(N^2 d)$ 降到线性或近线性，却忽略了不规则索引、哈希重排以及读写中间结果带来的 HBM 访问开销，加上无法像稠密矩阵乘法那样充分吃满硬件单元，导致 FLOPs 降低了，实际墙钟时间（wall-clock time）却常常没有比标准注意力更快。[论文，§1、§2.1](https://arxiv.org/pdf/2205.14135v2#page=1)

> **注：稀疏近似与低秩近似**
> **稀疏近似（Sparse Approximation）** 假定 $N\times N$ 注意力矩阵中只有少数位置重要，仅计算局部窗口、固定步长或经聚类/哈希筛选出的位置（如 Reformer、Longformer），把计算量降为 $O(N\log N)$ 或 $O(N\sqrt{N})$；**低秩近似（Low-Rank Approximation）** 假定注意力矩阵可由低秩结构逼近，将 $QK^{\mathsf T}$ 改写为低维投影或核函数随机特征展开（如 Linformer、Performer），把计算量降为 $O(Nk)$。两类方法都改变了注意力算子的数学定义，且稀疏索引或中间特征往往仍需频繁读写 HBM。[论文，§1、§4.3](https://arxiv.org/pdf/2205.14135v2#page=1)

### 标准实现把平方级中间矩阵在显存中往返搬运四次

**标准注意力的慢与爆显存来自同一件事：它把两张 $N\times N$ 的中间矩阵 $S$ 和 $P$ 完整写回 HBM，又从 HBM 完整读出。**

给定长度为 $N$ 的输入序列表示，经线性投影得到单头的查询矩阵 $Q\in\mathbb{R}^{N\times d}$、键矩阵 $K\in\mathbb{R}^{N\times d}$ 与值矩阵 $V\in\mathbb{R}^{N\times d}$。设 $\tau$ 为缩放因子（通常取 $1/\sqrt{d}$），第 $i$ 个查询向量 $q_i$ 与第 $j$ 个键向量 $k_j$ 的打分为 $s_{ij}=\tau q_i k_j^{\mathsf T}$（被掩码遮蔽的位置取 $-\infty$），按行归一化后对第 $j$ 个值向量 $v_j$ 加权求和：

$$
p_{ij} = \frac{\exp(s_{ij})}{\sum_{k=1}^{N} \exp(s_{ik})}, \qquad o_i = \sum_{j=1}^{N} p_{ij} v_j \tag{1}
$$

写成矩阵形式即 $S = \tau QK^{\mathsf T}\in\mathbb{R}^{N\times N}$、$P = \operatorname{softmax}(S)\in\mathbb{R}^{N\times N}$（按行执行）、$O = PV\in\mathbb{R}^{N\times d}$。注意下标关系：$P$ 的列号 $j$ 与 $V$ 的行号 $j$ 严格对齐，第 $j$ 个键算出的权重 $p_{ij}$ 必须乘在同一位置的 $v_j$ 上；因此 **键 $K$ 与值 $V$ 在位置维度 $j$ 上绑定**，而输出 $O$ 的行号 $i$ 与查询 $Q$ 的行号对齐。[论文，§2.2](https://arxiv.org/pdf/2205.14135v2#page=4)

> **注：点积打分与缩放因子的作用**
> $Q=XW_Q, K=XW_K, V=XW_V$ 由同一输入序列表示 $X\in\mathbb{R}^{N\times d_{\text{model}}}$ 乘可学习投影矩阵得到。两个向量的点积 $q_i k_j^{\mathsf T}$ 本身只是代数内积，并不天然代表语义相似；训练过程通过反向传播调整 $W_Q, W_K$，使需要交互的位置对产生较大的内积。随后行内 Softmax 只取决于同一行内各分数的差值，缩放因子 $\tau=1/\sqrt{d}$ 则用于防止高维内积方差过大导致指数进入饱和区。

论文将标准实现归纳为 **算法 0**：

```text
算法 0  标准注意力实现（来源：原文 §2.2 Algorithm 0）
输入: HBM 中的矩阵 Q, K, V ∈ R^(N×d)
输出: HBM 中的矩阵 O ∈ R^(N×d)
1: 从 HBM 按块加载 Q, K，计算 S = Q K^T，将 S ∈ R^(N×N) 写入 HBM
2: 从 HBM 读取 S，计算 P = softmax(S)，将 P ∈ R^(N×N) 写入 HBM
3: 从 HBM 按块加载 P 和 V，计算 O = P V，将 O ∈ R^(N×d) 写入 HBM
4: return O
```

常见模型配置下序列长度远大于单头维度（$N \gg d$）。以 GPT-2 的 $N=1024, d=64$ 为例，$Q,K,V,O$ 每个矩阵只有 $Nd = 65{,}536$ 个元素，而 $S$ 或 $P$ 一张矩阵就有 $N^2 = 1{,}048{,}576$ 个元素，是输入矩阵的 16 倍。算法 0 在第 1 步写出 $S$、第 2 步读入 $S$ 并写出 $P$、第 3 步再读入 $P$，单是这两张 $N\times N$ 矩阵就在 HBM 上往返了四次（含掩码与 Dropout 时还会增加逐元素读写），总访问量达 $\Theta(Nd + N^2)$。要消除这四次平方级搬运，算法必须同时解开两个硬约束：**第一，在没有看到整行分数 $S_{i,:}$ 的前提下，分块算出对整行精确归一化的 Softmax 输出；第二，不在 HBM 中保存 $P$，仍能完成反向传播的梯度计算。**[论文，§1、§2.2、算法 0](https://arxiv.org/pdf/2205.14135v2#page=4) <!-- derived -->

## 方法原理

### 在线 Softmax 用行最大值与指数和增量维护分母

**整个前向算法只有一个核心不变量：每一行 Softmax 的全局最大值基准与归一化分母，可以在分块扫描键向量的过程中用换基公式增量维护。**

先看单块向量 $x\in\mathbb{R}^B$ 的数值稳定 Softmax。标准定义 $\operatorname{softmax}(x)_a = e^{x_a}/\sum_b e^{x_b}$ 在分数较大时（例如 $x_a > 90$ 对 FP16/FP32）会直接触发指数上溢（overflow）变成 $\infty$。如果在分子和分母同时乘常数 $e^{-m(x)}$，其中 $m(x) := \max_a x_a$，分式的值完全不变：

$$
\frac{e^{x_a}}{\sum_b e^{x_b}} = \frac{e^{x_a}\cdot e^{-m(x)}}{\left(\sum_b e^{x_b}\right)\cdot e^{-m(x)}} = \frac{e^{x_a - m(x)}}{\sum_b e^{x_b - m(x)}} \tag{2}
$$

减去行最大值后，指数项的最大自变量为 $0$，每一项 $e^{x_a - m(x)}$ 都落在 $(0, 1]$ 区间内，从根本上消除了指数上溢。为此，论文对任意向量 $x\in\mathbb{R}^B$ 定义三个量：**行最大值** $m(x)$、**未归一化指数向量** $f(x)$ 与 **行指数和** $\ell(x)$：[论文，§3.1](https://arxiv.org/pdf/2205.14135v2#page=4)

$$
m(x) := \max_a x_a, \qquad f(x) := \begin{bmatrix} e^{x_1 - m(x)} & \cdots & e^{x_B - m(x)} \end{bmatrix}, \qquad \ell(x) := \sum_a f(x)_a \tag{3}
$$

于是 $\operatorname{softmax}(x) = f(x)/\ell(x)$。现在把一行分数拆成前后两个子块 $x = [x^{(1)}, x^{(2)}]\in\mathbb{R}^{2B}$。處理第一块时只知道局部最大值 $m(x^{(1)})$ 和以它为基准的局部指数和 $\ell(x^{(1)})$；处理第二块时得到 $m(x^{(2)})$ 和 $\ell(x^{(2)})$。两块的指数基准不同，不能直接把 $\ell(x^{(1)})$ 和 $\ell(x^{(2)})$ 相加。但利用指数恒等式 $e^{s - m(x)} = e^{s - m(x^{(1)})}\cdot e^{m(x^{(1)}) - m(x)}$，只需将旧块和新块各自乘上到新全局最大值 $m(x) = \max(m(x^{(1)}), m(x^{(2)}))$ 的换基系数，就能精确合成全局统计量（这一技巧源自 [Milakov 与 Gimelshein 的在线 Softmax 算法](https://arxiv.org/abs/1805.02867)）：[论文，§3.1](https://arxiv.org/pdf/2205.14135v2#page=4)

$$
\begin{aligned}
m(x) &= \max\!\left(m(x^{(1)}),\; m(x^{(2)})\right), \\
\ell(x) &= e^{m(x^{(1)}) - m(x)}\ell(x^{(1)}) + e^{m(x^{(2)}) - m(x)}\ell(x^{(2)})
\end{aligned} \tag{4}
$$

论文 **算法 1** 将式 (4) 推广到矩阵块并把加权值向量 $V_j$ 的累加一并融合（为突出分块主干，算法 1 省写了缩放与 Dropout，完整版见论文附录 B 算法 2）：[论文，§3.1、算法 1](https://arxiv.org/pdf/2205.14135v2#page=5)

```text
算法 1  FlashAttention 前向计算（来源：原文 §3.1 Algorithm 1）
输入: HBM 中的矩阵 Q, K, V ∈ R^(N×d)，容量为 M 的片上 SRAM
输出: HBM 中的精确注意力矩阵 O ∈ R^(N×d)
1:  设置块大小 B_c = ⌈M / (4d)⌉, B_r = min(⌈M / (4d)⌉, d)
2:  在 HBM 中初始化 O = (0)_(N×d) ∈ R^(N×d), ℓ = (0)_N ∈ R^N, m = (-∞)_N ∈ R^N
3:  将 Q 划分为 T_r = ⌈N / B_r⌉ 个块 Q_1, ..., Q_(T_r)（每块 B_r × d），
    将 K, V 划分为 T_c = ⌈N / B_c⌉ 个块 K_1, ..., K_(T_c) 与 V_1, ..., V_(T_c)（每块 B_c × d）
4:  将 O 划分为 T_r 个块 O_1, ..., O_(T_r)（每块 B_r × d），
    将 ℓ 划分为 T_r 个块 ℓ_1, ..., ℓ_(T_r)（每块长 B_r），将 m 划分为 T_r 个块 m_1, ..., m_(T_r)（每块长 B_r）
5:  for 1 ≤ j ≤ T_c do
6:      从 HBM 加载 K_j, V_j 到片上 SRAM
7:      for 1 ≤ i ≤ T_r do
8:          从 HBM 加载 Q_i, O_i, ℓ_i, m_i 到片上 SRAM
9:          在片上计算分数块 S_ij = Q_i K_j^T ∈ R^(B_r × B_c)
10:         在片上计算 m̃_ij = rowmax(S_ij) ∈ R^(B_r), P̃_ij = exp(S_ij - m̃_ij) ∈ R^(B_r × B_c)（逐元素）,
            ℓ̃_ij = rowsum(P̃_ij) ∈ R^(B_r)
11:         在片上更新 m_i^new = max(m_i, m̃_ij) ∈ R^(B_r),
            ℓ_i^new = exp(m_i - m_i^new) ℓ_i + exp(m̃_ij - m_i^new) ℓ̃_ij ∈ R^(B_r)
12:         将 O_i ← diag(ℓ_i^new)^(-1) (diag(ℓ_i) exp(m_i - m_i^new) O_i + exp(m̃_ij - m_i^new) P̃_ij V_j) 写回 HBM
13:         将 ℓ_i ← ℓ_i^new, m_i ← m_i^new 写回 HBM
14:     end for
15: end for
16: return O
```

| 符号 | 尺寸与存储位置 | 物理含义 |
|---|---|---|
| $B_c, B_r$ | 标量整数 | 单个键/值块的行数 $B_c = \lceil M/(4d)\rceil$，单个查询块的行数 $B_r = \min(\lceil M/(4d)\rceil, d)$ |
| $T_c, T_r$ | 标量整数 | 键/值总块数 $T_c = \lceil N/B_c\rceil$（外循环索引 $j$），查询总块数 $T_r = \lceil N/B_r\rceil$（内循环索引 $i$） |
| $O_i, \ell_i, m_i$ | $B_r\times d,\; B_r,\; B_r$（HBM $\leftrightarrow$ SRAM） | 第 $i$ 个查询块截至当前已处理键块的部分输出、累计指数和、累计行最大值 |
| $S_{ij}, \tilde P_{ij}$ | $B_r\times B_c$（仅在 SRAM） | 当前块分数矩阵 $S_{ij}=Q_i K_j^{\mathsf T}$，以及局部未归一化指数矩阵 $\tilde P_{ij}=\exp(S_{ij}-\tilde m_{ij})$ |
| $\tilde m_{ij}, \tilde \ell_{ij}$ | $B_r$（仅在 SRAM） | 当前分数块 $S_{ij}$ 每行的局部最大值 $\operatorname{rowmax}(S_{ij})$ 与局部指数和 $\operatorname{rowsum}(\tilde P_{ij})$ |

这张表把伪代码里的变量分成了两类：带波浪号的 $\tilde m_{ij}, \tilde P_{ij}, \tilde \ell_{ij}$ 只是当前键块 $j$ 的局部临时量，用完即弃；不带波浪号的 $m_i, \ell_i, O_i$ 则是跨块传递的三个累加器。算法 1 中真正承载机制的是 **第 10–12 行** 的三步状态接力：[论文，§3.1、算法 1](https://arxiv.org/pdf/2205.14135v2#page=5)

1. **算局部（第 10 行）**：对当前块 $S_{ij}\in\mathbb{R}^{B_r\times B_c}$ 按行取最大值 $\tilde m_{ij}$，逐行减去该最大值后取指数得到 $\tilde P_{ij}[a,b] = \exp(S_{ij}[a,b] - \tilde m_{ij}[a])$，再按行求和得 $\tilde \ell_{ij}$。
2. **对齐基准并合并分母（第 11 行）**：更新行最大值 $m_i^{\mathrm{new}} = \max(m_i, \tilde m_{ij})$。令旧基准换基系数为 $\alpha = e^{m_i - m_i^{\mathrm{new}}}$，新块换基系数为 $\beta = e^{\tilde m_{ij} - m_i^{\mathrm{new}}}$，合并后的指数和为 $\ell_i^{\mathrm{new}} = \alpha \ell_i + \beta \tilde \ell_{ij}$。
3. **还原旧分子、累加新分子并重归一化（第 12 行）**：旧部分输出 $O_i$ 此前已经除过旧分母 $\ell_i$。因此要先左乘 $\operatorname{diag}(\ell_i)$ 还原成以 $m_i$ 为基准的未归一化加权和，乘上 $\alpha$ 换到新基准 $m_i^{\mathrm{new}}$，再加上当前块换基后的未归一化加权和 $\beta \tilde P_{ij} V_j$，最后统一左乘 $\operatorname{diag}(\ell_i^{\mathrm{new}})^{-1}$ 除以新分母：

$$
O_i^{\mathrm{new}} = \operatorname{diag}(\ell_i^{\mathrm{new}})^{-1}\!\left(\operatorname{diag}(\ell_i) e^{m_i - m_i^{\mathrm{new}}} O_i + e^{\tilde m_{ij} - m_i^{\mathrm{new}}} \tilde P_{ij} V_j\right) \tag{5}
$$

::: warning
式 (5) 第二项中，$\tilde P_{ij} V_j$ 已经是当前块的未归一化加权分子 $\sum_{b} e^{S_{ij}[a,b]-\tilde m_{ij}[a]} V_j[b,:]$，千万不能像第一项那样再乘一次 $\tilde \ell_{ij}$。第一项乘 $\ell_i$ 只是为了把上一轮末尾除掉的旧分母抵消掉。
:::

当外循环走完 $j = 1, \dots, T_c$ 全部键/值块后，$m_i$ 就是整行 $N$ 个分数的全局最大值，$\ell_i$ 就是整行的全局指数和，$O_i$ 就是精确的 $\operatorname{softmax}(Q_i K^{\mathsf T})V$。定理 1 证明算法 1 的浮点运算量为 $O(N^2 d)$，除输入输出外仅需在 HBM 中存放 $m$ 和 $\ell$ 两个长度为 $N$ 的向量，额外显存为 $O(N)$。[论文，定理 1、附录 C](https://arxiv.org/pdf/2205.14135v2#page=5)

### 手算算例验证分块合并与完整矩阵计算结果一致

**用一组可手算的 $N=4, d=1$ 数据走完两轮外循环，能直接看清 $m, \ell, O$ 三个累加器如何把局部结果拼成全局精确解。**

下面这个算例为解释机制而构造（非论文实验数据）。设 $N=4, d=1$，片上容量参数取 $M=8$ 个标量元素，单头输入为：<!-- derived -->

$$
Q = \begin{bmatrix} 1 \\ 0 \\ 0 \\ 0 \end{bmatrix}, \qquad
K = \begin{bmatrix} 1 \\ 2 \\ 3 \\ 0 \end{bmatrix}, \qquad
V = \begin{bmatrix} 10 \\ 20 \\ 30 \\ 40 \end{bmatrix}
$$

**第 1 步：计算块尺寸并切分输入（对应算法 1 第 1、3–4 行）**

- **计算块行数**：$B_c = \lceil 8/(4\times 1)\rceil = 2$，$B_r = \min(2, 1) = 1$。<!-- derived -->
- **切分键/值块（共 $T_c = 4/2 = 2$ 块）**：
  - 块 1：$K_1 = [1, 2]^{\mathsf T}$，$V_1 = [10, 20]^{\mathsf T}$
  - 块 2：$K_2 = [3, 0]^{\mathsf T}$，$V_2 = [30, 40]^{\mathsf T}$
- **切分查询块（共 $T_r = 4/1 = 4$ 块，每块 1 行）**：$Q_1 = [1]$，$Q_2 = [0]$，$Q_3 = [0]$，$Q_4 = [0]$。<!-- derived -->
- **初始化 HBM 行状态（对应算法 1 第 2 行）**：
  - 部分输出：$O = [0, 0, 0, 0]^{\mathsf T}$
  - 行最大值：$m = [-\infty, -\infty, -\infty, -\infty]^{\mathsf T}$
  - 行指数和：$\ell = [0, 0, 0, 0]^{\mathsf T}$

下面重点追踪第 1 个查询行 $Q_1 = [1]$ 在两轮外循环中的状态更新（其余三行 $Q_2 = Q_3 = Q_4 = [0]$ 对所有键的打分恒为 $0$，第 1 轮后各得 $(10+20)/2 = 15$，第 2 轮后各得 $(10+20+30+40)/4 = 25$）：[论文，算法 1](https://arxiv.org/pdf/2205.14135v2#page=5) <!-- derived -->

![在线 Softmax 跨块换基与状态合并示意：以查询行分数 [1, 2 | 3, 0] 与值向量 [10, 20 | 30, 40] 为例](/images/papers/flash-attention/online-softmax-rescaling.svg)

*图：算例中查询行 $Q_1=[1]$ 在两轮外循环中的状态流转。块 2 出现更大的分数 $3$ 后，块 1 的指数和 $\ell_1$ 与未归一化分子 $\ell_1 O_1$ 均乘以换基系数 $\alpha = e^{2-3} = e^{-1}$，再与块 2 相加。（自构教学算例示意图）*

| 外循环轮次 | 块内分数 $S_{1j}$ | 块内统计量 $(\tilde m_{1j}, \tilde P_{1j}, \tilde \ell_{1j})$ | 换基系数 $(\alpha, \beta)$ | 更新后写回 HBM 的 $(m_1, \ell_1, O_1)$ |
|---|---|---|---|---|
| 初始（$j=0$） | — | — | — | $(-\infty,\; 0,\; 0)$ |
| 第 1 轮（$j=1$） | $[1, 2]$ | $\tilde m_{11}=2,\; \tilde P_{11}=[e^{-1}, 1],\; \tilde \ell_{11}=1+e^{-1}\approx 1.3679$ | $\alpha=0,\; \beta=1$ | $(2,\; 1.3679,\; 17.3106)$ |
| 第 2 轮（$j=2$） | $[3, 0]$ | $\tilde m_{12}=3,\; \tilde P_{12}=[1, e^{-3}],\; \tilde \ell_{12}=1+e^{-3}\approx 1.0498$ | $\alpha=e^{-1},\; \beta=1$ | $(3,\; 1.5530,\; 26.2089)$ |

<!-- derived -->

**第 2 步：外循环第 1 轮（$j=1$，装入 $K_1, V_1$）**

- **片上算局部统计量（第 9–10 行）**：
  - 分数块：$S_{11} = Q_1 K_1^{\mathsf T} = [1, 2]$
  - 块内最大值：$\tilde m_{11} = \max(1, 2) = 2$
  - 局部未归一化指数：$\tilde P_{11} = [e^{1-2}, e^{2-2}] = [e^{-1}, 1]$
  - 块内指数和：$\tilde \ell_{11} = e^{-1} + 1 \approx 1.3679$ <!-- derived -->
- **与初始状态合并写回（第 11–13 行）**：
  - 因初始 $m_1 = -\infty, \ell_1 = 0$，旧块换基系数 $\alpha = e^{-\infty - 2} = 0$，新块系数 $\beta = e^{2-2} = 1$
  - 更新后 $m_1 = 2$，$\ell_1 = \tilde \ell_{11} \approx 1.3679$
  - 第 1 轮部分输出（只针对前两个键并以 $m_1=2$ 为基准）：<!-- derived -->

$$
O_1 = \frac{\tilde P_{11} V_1}{\ell_1} = \frac{10e^{-1} + 20}{1 + e^{-1}} \approx \frac{23.6788}{1.3679} \approx 17.3106
$$

**第 3 步：外循环第 2 轮（$j=2$，装入 $K_2, V_2$ 并换基合并）**

- **片上算局部统计量（第 9–10 行）**：
  - 分数块：$S_{12} = Q_1 K_2^{\mathsf T} = [3, 0]$
  - 块内最大值：$\tilde m_{12} = \max(3, 0) = 3$
  - 局部未归一化指数：$\tilde P_{12} = [e^{3-3}, e^{0-3}] = [1, e^{-3}]$
  - 块内指数和：$\tilde \ell_{12} = 1 + e^{-3} \approx 1.0498$ <!-- derived -->
- **对齐指数基准（第 11 行）**：
  - 全局最大值刷新为：$m_1^{\mathrm{new}} = \max(m_1, \tilde m_{12}) = \max(2, 3) = 3$
  - 旧块换基系数（基准从 $2$ 升到 $3$）：$\alpha = e^{2-3} = e^{-1} \approx 0.3679$
  - 新块换基系数：$\beta = e^{3-3} = 1$ <!-- derived -->
- **合并分母、分子并求最终输出（第 11–13 行）**：
  - **新分母**：$\ell_1^{\mathrm{new}} = \alpha \ell_1 + \beta \tilde \ell_{12} = e^{-1}(1+e^{-1}) + 1\cdot(1+e^{-3}) = e^{-2} + e^{-1} + 1 + e^{-3} \approx 1.5530$ <!-- derived -->
  - **新未归一化分子**：$u_{\mathrm{new}} = \alpha(\ell_1 O_1) + \beta(\tilde P_{12} V_2) = e^{-1}(10e^{-1}+20) + (30\cdot 1 + 40e^{-3}) = 10e^{-2} + 20e^{-1} + 30 + 40e^{-3} \approx 40.7024$ <!-- derived -->
  - **最终输出**：$O_1^{\mathrm{new}} = u_{\mathrm{new}} / \ell_1^{\mathrm{new}} \approx 40.7024 / 1.5530 \approx 26.2089$ <!-- derived -->

**第 4 步：与完整矩阵标准计算核对**

若不切块，一次性读取整行分数 $S_{1,:} = [1, 2, 3, 0]$，全局最大值为 $3$，标准 Softmax 加权输出为：

$$
O_1 = \frac{10e^{1-3} + 20e^{2-3} + 30e^{3-3} + 40e^{0-3}}{e^{1-3} + e^{2-3} + e^{3-3} + e^{0-3}} = \frac{10e^{-2} + 20e^{-1} + 30 + 40e^{-3}}{e^{-2} + e^{-1} + 1 + e^{-3}} \approx 26.2089
$$

两轮分块合并的结果与完整矩阵计算完全一致。[论文，§3.1、算法 1](https://arxiv.org/pdf/2205.14135v2#page=5) <!-- derived -->

### 反向传播依靠行统计量在片上重算局部概率矩阵

**前向保存的 $m$ 和 $\ell$ 已经汇总了整行所有键的信息，因此反向传播只需在片上重算当前块的分数 $S_{ij}$，就能直接恢复全局精确概率 $P_{ij}$，无需在 HBM 中存储 $N\times N$ 的概率矩阵。**

反向传播已知损失函数对输出 $O$ 的梯度 $dO\in\mathbb{R}^{N\times d}$，要求输入梯度 $dQ, dK, dV\in\mathbb{R}^{N\times d}$。以不含 Dropout 和缩放的简化形式说明核心链条（含缩放 $\tau$、掩码与伪随机数种子重放 Dropout 的完整工程流程见论文附录 B.4 算法 4）：由 $O = PV$ 可知 $dV = P^{\mathsf T} dO$ 且概率梯度为 $dP = dO V^{\mathsf T}$；由 $P = \operatorname{softmax}(S)$ 可知分数梯度对第 $r$ 行、第 $t$ 列满足 $dS_{rt} = p_{rt}\!\left(dP_{rt} - \sum_u p_{ru} dP_{ru}\right)$；最后由 $S = QK^{\mathsf T}$ 得到 $dQ = dS\,K$ 与 $dK = dS^{\mathsf T} Q$。整个链条处处依赖概率矩阵 $P$。[论文，附录 B.2、B.4](https://arxiv.org/pdf/2205.14135v2#page=18)

如果前向为了反向传播把整张 $P\in\mathbb{R}^{N\times N}$ 留在 HBM，前向省下的 $O(N^2)$ 显存就会前功尽弃。FlashAttention 的做法是两条代数简化配合片上分块重算：[论文，§3.1、附录 B.2、算法 4](https://arxiv.org/pdf/2205.14135v2#page=20)

1. **利用最终行状态 $(m_i, \ell_i)$ 直接恢复全局概率块**：前向结束时，HBM 中的 $m_i\in\mathbb{R}^{B_r}$ 和 $\ell_i\in\mathbb{R}^{B_r}$ 已经是看完全部 $N$ 个键之后的**全局**最大值与全局分母。反向传播将 $Q_i, K_j$ 装入 SRAM 重算 $S_{ij} = Q_i K_j^{\mathsf T}$ 后，不再需要跨块递推，一步就能算出当前块的全局概率矩阵：

$$
P_{ij} = \operatorname{diag}(\ell_i)^{-1} \exp(S_{ij} - m_i) \tag{6}
$$

2. **用 $dO \odot O$ 消除 Softmax 反向的跨块求和**：Softmax 反向公式里有一项行内求和 $D_r = \sum_{u=1}^{N} p_{ru} dP_{ru}$。代入 $dP_{ru} = dO_r v_u^{\mathsf T}$，利用结合律把 $dO_r$ 提到求和号外：

$$
D_r = \sum_{u=1}^{N} p_{ru} (dO_r v_u^{\mathsf T}) = dO_r \cdot \left(\sum_{u=1}^{N} p_{ru} v_u\right)^{\mathsf T} = dO_r \cdot o_r^{\mathsf T} = \operatorname{rowsum}(dO_r \odot o_r) \tag{7}
$$

其中 $\odot$ 表示 **哈达玛积（Hadamard Product，即逐元素乘积）**。式 (7) 说明，求 $D\in\mathbb{R}^N$ 根本不需要拼出整行 $P$ 和 $dP$，直接把 HBM 中现成的前向输出 $O$ 与梯度 $dO$ 逐元素相乘再按行求和即可，复杂度仅为 $O(Nd)$。[论文，附录 B.2、算法 4 第 5 行](https://arxiv.org/pdf/2205.14135v2#page=19)

```text
算法 2  FlashAttention 反向传播核心流程（来源：原文附录 B.4 算法 4 简化版）
输入: HBM 中的矩阵 Q, K, V, O, dO ∈ R^(N×d)，全局行状态向量 l, m ∈ R^N
输出: HBM 中的梯度矩阵 dQ, dK, dV ∈ R^(N×d)
1: 在 HBM 中初始化 dQ = 0, dK = 0, dV = 0，计算行内点积向量 D = rowsum(dO ⊙ O) ∈ R^N
2: 按块划分 Q, O, dO, dQ, l, m, D（各 Tr 块）与 K, V, dK, dV（各 Tc 块）
3: for j = 1 to Tc do
4:     从 HBM 加载 K_j, V_j 到 SRAM，在片上初始化 dK_j_tilde = 0, dV_j_tilde = 0
5:     for i = 1 to Tr do
6:         从 HBM 加载 Q_i, O_i, dO_i, dQ_i, l_i, m_i, D_i 到 SRAM
7:         在片上重算分数块 S_ij = Q_i K_j^T，恢复全局概率块 P_ij = diag(l_i)^(-1) exp(S_ij - m_i)
8:         在片上累加值梯度 dV_j_tilde ← dV_j_tilde + P_ij^T dO_i，计算 dP_ij = dO_i V_j^T
9:         在片上计算分数梯度 dS_ij = P_ij ⊙ (dP_ij - D_i)
10:        更新 HBM 中的 dQ_i ← dQ_i + dS_ij K_j，在片上累加 dK_j_tilde ← dK_j_tilde + dS_ij^T Q_i
11:    end for
12:    将片上累加完毕的 dK_j_tilde, dV_j_tilde 写回 HBM 的 dK_j, dV_j
13: end for
14: return dQ, dK, dV
```

伪代码第 7–10 行展示：每一块 $P_{ij}, dP_{ij}, dS_{ij}\in\mathbb{R}^{B_r\times B_c}$ 从生成、求导到消费全在片上 SRAM 内完成，转入下一块前即释放。反向传播虽然多算了一次 $Q_i K_j^{\mathsf T}$ 和指数，却彻底免去了向 HBM 写入和读取 $N\times N$ 矩阵的开销。定理 5 证明反向传播的 HBM 访问量同样为 $\Theta(N^2 d^2 M^{-1})$，额外显存仍为 $O(N)$。[论文，附录 B.4 算法 4、附录 C 定理 5](https://arxiv.org/pdf/2205.14135v2#page=21)

### 外层遍历键值块将片外访问量压低到与块大小成反比

**键值同下标配对决定了计算结果是否正确，而外层遍历键值块、内层遍历查询块的顺序决定了在有限 SRAM 容量下能把 HBM 读写次数压到多低。**

读算法 1 时常见的一个疑问是：为什么外循环是键/值块 $K_j, V_j$，内循环是查询块 $Q_i$？如果反过来把 $Q_i$ 放在外循环、$K_j, V_j$ 放在内循环，算出的注意力输出会变吗？

答案分两层：**第一，数学结果完全不变。** 只要求内积的 $K_j$ 和做加权的 $V_j$ 保持相同的位置下标块号 $j$，并且对每个查询行合并完所有键块，先固定 $j$ 遍历 $i$ 与先固定 $i$ 遍历 $j$ 只是调换有限求和与在线合并的次序。拿上一节 $N=4, d=1$ 的算例验证：若改为外层固定 $Q_1=[1]$，内层先读 $(K_1, V_1)$ 算出 $(m_1=2, \ell_1\approx 1.3679, O_1\approx 17.3106)$，再读 $(K_2, V_2)$ 换基合并，最终同样得到 $O_1\approx 26.2089$。真正不能破坏的是 $K_j$ 与 $V_j$ 的同位置绑定——如果拿 $K_1=[1,2]^{\mathsf T}$ 算出的权重去乘 $V_2=[30,40]^{\mathsf T}$，第一块输出就会错算成 $(30e^{-1}+40)/(1+e^{-1})\approx 37.3106$。[论文，§2.2、算法 1](https://arxiv.org/pdf/2205.14135v2#page=5) <!-- derived -->

**第二，HBM 访问量与片上分块约束决定了算法 1 选外层 K/V。** 在算法 1 中，片上 SRAM 需要同时装下 $K_j, V_j\in\mathbb{R}^{B_c\times d}$（各占 $B_c d$ 个元素）、$Q_i, O_i\in\mathbb{R}^{B_r\times d}$（各占 $B_r d$ 个元素）以及尺寸为 $B_r\times B_c$ 的分数块 $S_{ij}$ 和 $\tilde P_{ij}$。为了保证前四项装得进容量为 $M$ 的 SRAM，论文取 $B_c = \Theta(M/d)$（具体设为 $\lceil M/(4d)\rceil$）；而为了让中间块 $S_{ij}\in\mathbb{R}^{B_r\times B_c}$ 也装进 SRAM（即 $B_r B_c = O(M)$），论文将 $B_r$ 限制为 $\min(\lceil M/(4d)\rceil, d)$。当片上容量较大使 $\lceil M/(4d)\rceil > d$ 时，有 $B_c > B_r$，从而键/值块数 $T_c = \lceil N/B_c\rceil$ 小于查询块数 $T_r = \lceil N/B_r\rceil$。把 $K_j, V_j$ 放在外循环，整套 $K$ 和 $V$ 从 HBM 只读一次（共 $2Nd$ 个元素），内循环的 $Q$ 和 $O$ 则随外循环重复读写 $T_c$ 轮；若保持同样的 $B_r, B_c$ 却对调内外循环，外循环将执行次数更多的 $T_r$ 轮，导致 $K,V$ 被重复读取 $T_r$ 次。[论文，§3.2、定理 2、附录 C](https://arxiv.org/pdf/2205.14135v2#page=6)

> **注：与 FlashAttention-2 循环顺序的区别**
> 后续工作 FlashAttention-2 在重新调整块尺寸与线程块分工后，将前向循环改写为外层遍历 $Q$ 块、内层遍历 $K/V$ 块，使 $O_i, m_i, \ell_i$ 全程留在片上寄存器中累加、最后只写回 HBM 一次。但在本篇 FlashAttention（2022）的算法 1 与定理 2 中，外层遍历 $K/V$、内层遍历 $Q$ 并按 $T_c = \Theta(Nd/M)$ 统计重读次数，是原文的确切设计。

下面按定理 2 的口径对比单头前向的 HBM 元素访问次数（假设 $d \le M \le Nd$）：[论文，§3.2、附录 C](https://arxiv.org/pdf/2205.14135v2#page=23)

| 实现方案 | 各阶段 HBM 读写构成 | 元素访问次数合计 | 渐近复杂度 |
|---|---|---|---:|
| 标准注意力（算法 0） | 读 $Q,K$（$2Nd$）写 $S$（$N^2$）；读 $S$ 写 $P$（$2N^2$）；读 $P,V$（$N^2+Nd$）写 $O$（$Nd$） | $4Nd + 4N^2$ | $\Theta(Nd + N^2)$ |
| FlashAttention（算法 1） | 初始化写 $O,m,\ell$（$Nd+2N$）；外循环读 $K,V$ 一次（$2Nd$）；内循环每轮读 $Q$、读写 $O,m,\ell$ 共 $T_c$ 轮 | $3Nd + 2N + T_c(3Nd + 4N)$ | $\Theta(N^2 d^2 M^{-1})$ |

<!-- derived -->

将 $B_c = \Theta(M/d)$ 代入 $T_c = \lceil N/B_c\rceil = \Theta(Nd/M)$，算法 1 的主项就是 $T_c \cdot \Theta(Nd) = \Theta(N^2 d^2 M^{-1})$。取一组具体参数分步核对访问次数：

- **设定参数**：令 $N=1024,\; d=64,\; M=65{,}536$ 个标量元素，则 $Nd = 65{,}536$，$N^2 = 1{,}048{,}576$。<!-- derived -->
- **计算分块数**：键/值块大小 $B_c = \lceil 65{,}536/(4\times 64)\rceil = 256$，外循环轮数 $T_c = 1024/256 = 4$。<!-- derived -->
- **标准注意力访问次数**：$4(65{,}536) + 4(1{,}048{,}576) = 4{,}456{,}448$ 个元素。<!-- derived -->
- **FlashAttention 访问次数**：$3(65{,}536) + 2(1024) + 4[3(65{,}536) + 4(1024)] = 1{,}001{,}472$ 个元素。<!-- derived -->
- **对比结果**：在该教学计数口径下，标准实现的 HBM 访问次数约为 FlashAttention 的 **4.45 倍**（论文图 2 实测含正反向与完整内核开销，报告了从 40.3 GB 到 4.4 GB 的 9 倍字节缩减）。<!-- derived -->

论文命题 3 进一步证明了 **IO 下界**：在任意片上容量 $M\in[d, Nd]$ 下，不存在能对所有 $M$ 渐近低于 $\Omega(N^2 d^2 M^{-1})$ 次 HBM 访问的精确注意力算法。[论文，§3.2、定理 2、命题 3、附录 C](https://arxiv.org/pdf/2205.14135v2#page=6)

## 实验与证据

### 图 2 与图 3 证实耗时随显存读写下降且显存呈线性增长

**在 GPT-2 medium 注意力基准上，FlashAttention 的浮点计算量比标准实现多出 13%，但因 HBM 读写量降到九分之一，正反向总耗时降到了原来的六分之一。**

![原文图 2：左表对比标准注意力与 FlashAttention 的 GFLOPs、HBM 读写与耗时；中图展示块大小对 HBM 访问与前向耗时的影响；右图展示块稀疏比例与耗时关系](/images/papers/flash-attention/fig2-io-and-runtime.png)

*图 2：左表在单张 A100 GPU 上测量 GPT-2 medium 注意力（序列长度 $N=1024$，头维度 $d=64$，16 个头，批量大小 64，含正反向）；中图在相同配置下改变分块大小 $B_c$ 测量前向 HBM 访问量与耗时；右图在 $N=4096$ 下改变块稀疏注意力的非零块比例。截取自[Dao 等，2022，原文图 2](https://arxiv.org/pdf/2205.14135v2#page=6)。*

图 2 左表直接验证了「注意力受限于 IO 而非 FLOPs」的核心论断：反向重算使总计算量从 **66.6 GFLOPs** 增加到 **75.2 GFLOPs**（增加约 13%），但消除 $S$ 和 $P$ 的显存往返后，HBM 读写量从 **40.3 GB** 降到 **4.4 GB**，正反向运行时间随之从 **41.7 ms** 降到 **7.3 ms**。图 2 中图进一步验证分块大小的作用：当块大小从 64 增至 256 时，$T_c$ 减小，HBM 访问量与实际耗时同步下降；当块大小超过 256 继续增至 512 时，HBM 访问量虽继续下降，耗时曲线却趋于平缓，因为此时算子已不再单纯受 HBM 带宽限制，转而受算力或寄存器/共享内存资源制约。[论文，§3.2、图 2](https://arxiv.org/pdf/2205.14135v2#page=6)

![原文图 3：左图为不同序列长度下各类注意力方法的正反向耗时对比，右图为注意力显存占用随序列长度的变化](/images/papers/flash-attention/fig3-runtime-and-memory.png)

*图 3：在单张 40 GB A100 GPU（批量大小 16，8 个头，头维度 $d=64$）上，左图对比序列长度从 128 到 8192 的正反向耗时（对数坐标），右图对比序列长度至 64K 的注意力显存占用。截取自[Dao 等，2022，原文图 3](https://arxiv.org/pdf/2205.14135v2#page=9)。*

图 3 左图回答了此前关于近似注意力的疑问：在序列长度 128 到 512 区间，稠密精确的 FlashAttention（黑色点线）不仅比 PyTorch 和 Megatron 标准注意力快达 3 倍，甚至比 Linformer、OpenAI Sparse 等近似或稀疏注意力更快——因为短序列下近似方法省掉的 FLOPs 抵不过它们额外的内存访问开销。随着序列继续拉长，稠密 FlashAttention 仍需计算全部 $N^2$ 对查询与键，二次方计算量逐渐主导耗时，曲线在 **512 到 1024** 之间与部分近似注意力出现交叉（Crossover Points）；而将同样的 IO 感知分块用于跳过零块的 **块稀疏 FlashAttention（Block-Sparse FlashAttention）**（绿色虚线），则在所有序列长度上都快于已有近似与稀疏基线。图 3 右图展示显存曲线：标准精确基线因保存 $N\times N$ 矩阵呈二次方暴涨并很快显存溢出（OOM），FlashAttention 的注意力显存则随序列长度呈线性增长，比精确基线节省最高达 **20 倍** 显存，除 Linformer 外其余基线均在 64K 前耗尽 40 GB 显存。[论文，§4.3、图 3、附录 E.6](https://arxiv.org/pdf/2205.14135v2#page=9)

### 显存节省转化为端到端训练加速与长上下文任务收益

**在保持完全相同的注意力计算定义与模型配置时，FlashAttention 只加速训练而不改变模型指标；当利用它省下的显存把上下文拉长到 4K–64K 时，模型才能获得更低的困惑度与更高的长序列任务准确率。**

| 实验任务与硬件配置 | 对照基线结果 | FlashAttention 结果 | 证据支持的结论与边界 |
|---|---|---|---|
| **BERT-large 预训练**（序列长度 512，达到 72.0% 掩码语言模型准确率的时间，8×A100-80GB，10 次均值） | NVIDIA MLPerf 1.1 记录：20.0 ± 1.5 分钟 | **17.4 ± 1.4 分钟** | 相同精度目标下端到端训练时间缩短约 13%（论文表述为速度提升 15%） |
| **GPT-2 small 预训练**（OpenWebText，序列长度 1K，8×A100-40GB） | Hugging Face：困惑度 18.2，耗时 9.5 天；Megatron-LM：困惑度 18.2，耗时 4.7 天 | **困惑度 18.2，耗时 2.7 天** | 固定 1K 上下文时，困惑度与两个精确基线完全一致（18.2），训练速度比 HF 快 3.5 倍、比 Megatron 快 1.7 倍 |
| **GPT-2 medium 预训练**（OpenWebText，序列长度 1K，8×A100-40GB） | Hugging Face：困惑度 14.2，耗时 21.0 天；Megatron-LM：困惑度 14.3，耗时 11.5 天 | **困惑度 14.3，耗时 6.9 天** | 同样不改变 1K 模型困惑度，训练速度比 HF 快 3.0 倍、比 Megatron 快 1.7 倍 |
| **GPT-2 small 扩长上下文**（OpenWebText，上下文由 1K 扩至 4K，8×A100-40GB） | Megatron-LM（1K 上下文）：困惑度 18.2，耗时 4.7 天 | **FlashAttention（4K 上下文）：困惑度 17.5，耗时 3.6 天** | 4K 上下文的总训练时间仍比 1K 的 Megatron 快 30%，且更长的上下文使验证集困惑度从 18.2 降至 17.5 |
| **Long-Range Arena（LRA）**（5 项长序列分类基准，序列长度 1024–4096） | 标准 Transformer：平均准确率 59.3%，速度 1.0× | **稠密版：59.8%，2.4× 加速；块稀疏版：59.6%，2.8× 加速** | 在 1K–4K 序列上保持与标准注意力同等的准确率，并提供 2.4–2.8 倍加速 |
| **长文档分类与超长序列挑战**（MIMIC-III、ECtHR、Path-X 16K、Path-256 64K） | 长度 512 基线：MIMIC 52.8，ECtHR 72.2；Path-X 与 Path-256 既往 Transformer 均显存溢出或仅达随机猜测水平 | **MIMIC（16K）：57.1（+4.3）；ECtHR（8K）：80.7（+8.5）；Path-X（16K 稠密）：61.4%；Path-256（64K 块稀疏）：63.1%** | 线性显存占用让模型能扩展到 16K–64K 序列，从而利用长距离依赖提升下游指标 |

上表汇总自论文 §4.1–§4.2。[论文，表 1–6](https://arxiv.org/pdf/2205.14135v2#page=7) 其中语言模型评估使用的 **困惑度（Perplexity, PPL）** 是验证集上真实下一个 token 负对数似然的指数：设验证序列有 $L$ 个位置，模型在给定前文 $w_{<t}$ 时输出词表上的未归一化打分（logits）$z_t$，经 $\operatorname{softmax}(z_t)$ 得到真实词 $w_t$ 的预测概率 $p(w_t \mid w_{<t})$，则困惑度定义为：

$$
\mathrm{PPL} = \exp\!\left(-\frac{1}{L}\sum_{t=1}^{L} \log p(w_t \mid w_{<t})\right) \tag{8}
$$

模型对真实后续词分配的概率越高，交叉熵损失越小，**困惑度数值就越低**。因此论文摘要与 §4.2 中说 GPT-2 困惑度「改善（improvement）了 0.7」，指的是困惑度从 18.2 **下降** 到 17.5。同时必须区分表中两类实验的因果归属：在表 2 中固定上下文长度为 1K 时，FlashAttention 与 Megatron-LM、Hugging Face 算出相同的困惑度，因为精确算子本身不改变数学函数；表 4 中困惑度下降 0.7，是因为线性显存开销允许将训练上下文从 1K 扩大到 4K，模型看到了更长的前文信息。[论文，§4.1–4.2、表 2、表 4](https://arxiv.org/pdf/2205.14135v2#page=8)

::: tip
评估指标中的困惑度（PPL）与文本生成推理时的采样温度（Temperature, $T$）属于不同阶段的概念。生成时调节温度是在输出层计算 $\operatorname{softmax}(z_t / T)$：$T < 1$ 使分布更尖锐、输出更确定，$T > 1$ 使分布更平坦、采样更多样；而论文表 2 和表 4 报告的困惑度是在固定 $T=1$ 下对验证集真实文本计算的统计损失。低困惑度仅代表模型拟合训练分布的预测能力更强，不直接等同于开放式生成时的创造性。
:::

## 局限性

**稠密 FlashAttention 消除了平方级的显存读写，却没有减少平方级的浮点乘加次数；当序列长度或头维度超出片上分块甜点区时，算力和硬件资源会重新成为瓶颈。**

1. **稠密版本的计算复杂度仍是 $O(N^2 d)$**：对于不跳过任何位置的稠密精确注意力，算法仍需遍历全部 $T_r \times T_c$ 个分块配对。图 3 左图显示，当序列长度超过 1024 后，二次方计算量使稠密 FlashAttention 的耗时高于 Linformer 等线性近似方法。论文提出的块稀疏版本将 IO 复杂度降为 $\Theta(Nd + N^2 d^2 M^{-1} s)$（$s$ 为非零块比例），但那是针对预设稀疏掩码定义的近似注意力，不再等价于稠密注意力。[论文，§3.3、§4.3、命题 4](https://arxiv.org/pdf/2205.14135v2#page=6)
2. **受片上 SRAM 容量 $M$ 与头维度 $d$ 制约**：分块尺寸 $B_c = \lceil M/(4d)\rceil$ 与 $d$ 成反比、与 $M$ 成正比。论文附录 E.4–E.5 的实测表明，当头维度从 $d=64$ 增大到 $d=128$，或从 A100（每 SM 192 KB SRAM）换到 SRAM 更小的 T4 GPU 时，为了放进片上存储必须缩小块大小，导致外循环次数增加、实际加速比下降。[论文，附录 E.4–E.5、表 7、图 5–8](https://arxiv.org/pdf/2205.14135v2#page=27)
3. **算子工程与多卡通信边界**：作者在 §5 指出，将注意力融合为单个 CUDA 内核意味着每新增一种注意力变体就需重新编写底层 CUDA 代码，且针对特定 GPU 架构调优的内核参数不能直接跨代迁移；此外，文中的 IO 复杂度仅建模单卡内 HBM 与 SRAM 的数据搬运，未计入多 GPU 分布式训练时的跨卡通信开销。论文全部主实验集中在训练阶段与单批前反向基准，未评测自回归推理中逐 token 解码（KV Cache 阶段，$Q$ 长度仅为 1）的负载特征。[论文，§5](https://arxiv.org/pdf/2205.14135v2#page=10)

## 结论

FlashAttention 建立了一条清晰的工程与理论主线：在现代 GPU 上，标准注意力的主要耗时与显存开销来自把 $N\times N$ 的分数矩阵 $S$ 与概率矩阵 $P$ 反复读写于片外 HBM。前向通过 **分块（Tiling）** 与 **在线 Softmax** 的换基恒等式，仅靠每行的最大值 $m$、指数和 $\ell$ 与部分输出 $O$ 就在片上 SRAM 内增量合成出精确注意力输出；反向传播通过 **重算（Recomputation）** 与 $D = \operatorname{rowsum}(dO \odot O)$ 化简，以增加约 13% 浮点运算量为代价，将前反向 HBM 访问量压低到 $\Theta(N^2 d^2 M^{-1})$，并将额外显存从 $O(N^2)$ 降为 $O(N)$。判断该算法在具体场景下的收益时，只需核对三项条件：任务是否受限于 $N\times N$ 矩阵的 HBM 读写与显存占用、头维度 $d$ 与 GPU 片上 SRAM 容量 $M$ 是否允许足够大的分块，以及序列长度是否已进入二次方计算量主导的区间。[论文，§3.1–3.2、§4.3、§5](https://arxiv.org/pdf/2205.14135v2#page=5)

## 延伸阅读

- **FlashAttention 原论文**：Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré, [*FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*](https://arxiv.org/abs/2205.14135), NeurIPS 2022（[论文，全文与附录](https://arxiv.org/pdf/2205.14135v2#page=1)）。
- **FlashAttention 官方代码仓库**：[Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)（原 `HazyResearch/flash-attention`，包含论文 CUDA 内核实现与后续版本）。
- **在线 Softmax 数值稳定递推**：Maxim Milakov, Natalia Gimelshein, [*Online normalizer calculation for softmax*](https://arxiv.org/abs/1805.02867)（论文 §3.1 在线换基公式的前置方法）。
- **显存节省与自注意力分块前驱工作**：Markus N. Rabe, Charles Staats, [*Self-attention Does Not Need $O(n^2)$ Memory*](https://arxiv.org/abs/2112.05682)（提出了省去 $O(N^2)$ 中间显存的分块思路，FlashAttention 在此基础上针对 GPU SRAM/HBM 做了 IO 复杂度优化与单内核融合）。
- **FlashAttention-2（循环顺序与并行切分改进）**：Tri Dao, [*FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning*](https://arxiv.org/abs/2307.08691)（将前向循环改写为外层遍历 $Q$、内层遍历 $K/V$，减少非矩阵乘法指令并提升序列维度并行度）。
- **GPU 算术强度与 Roofline 性能模型**：Samuel Williams, Andrew Waterman, David Patterson, [*Roofline: An Insightful Visual Performance Model for Multicore Architectures*](https://dl.acm.org/doi/10.1145/1498765.1498785), Communications of the ACM（论文 §2.1 区分计算受限与显存带宽受限的理论基础）。
