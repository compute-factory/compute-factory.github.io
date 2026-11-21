---
title: FlashAttention：以分块与在线 Softmax 消除注意力矩阵的显存往返
description: 精读 Dao 等人的 FlashAttention 论文（arXiv:2205.14135v2），解析分块、在线 Softmax 换基与反向重算如何把精确注意力的显存占用压到线性并加速训练。
---

# FlashAttention：以分块与在线 Softmax 消除注意力矩阵的显存往返

这篇报告精读 Tri Dao 等人的 [*FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*](https://arxiv.org/abs/2205.14135)（[arXiv:2205.14135v2](https://arxiv.org/pdf/2205.14135v2)，2022 年 6 月版）。长序列 Transformer 的核心瓶颈不在自注意力的浮点乘加次数，而在 GPU 高带宽显存与片上存储之间<mark>反复搬运 $N\times N$ 的中间矩阵</mark>。读完你将掌握三件事：为什么降低浮点运算量的近似注意力往往没有实际加速、在线 Softmax 如何在只看见局部键块时增量维护整行归一化分母、反向传播如何仅凭行统计量重算梯度。文中实验数据与图表全部取自论文 v2 原文，未在其他硬件上重跑基准测试。

## 主要工作

**FlashAttention 计算的仍是完整的 $\operatorname{softmax}(QK^{\mathsf T})V$，一个注意力位置都没有跳过；它改变的是中间结果在哪里生成、算完是否写回显存。**

算法围绕 GPU 两级存储设计：高带宽显存（High Bandwidth Memory, HBM，以下简称 HBM）是容量达数十 GB 但带宽较低的片外主显存；片上静态随机存取存储器（Static Random-Access Memory, SRAM，以下简称 SRAM）是每个流多处理器内部容量仅百余 KB 但带宽高一个数量级的片上存储（含共享内存与寄存器资源）。论文将显存层级之间的数据读写定义为 IO（输入/输出访问），提出 IO 感知（IO-aware）的精确注意力（Exact Attention）算法：前向计算采用**分块（Tiling）**，在 SRAM 内分块生成局部分数并原地更新每行的最大值、指数和与部分输出，<mark>从头到尾不在 HBM 中实例化 $N\times N$ 的注意力矩阵</mark>；反向传播采用**重算（Recomputation）**，利用前向保存的行统计量在片上按块恢复注意力概率，省去为反向传播保留平方级中间矩阵的显存开销。[论文，§1、§3.1](https://arxiv.org/pdf/2205.14135v2#page=2)

在序列长度 $N$、单头维度 $d$、片上可用容量 $M$（以标量元素个数计，$d \le M \le Nd$）的条件下，标准注意力前向需要 $\Theta(Nd + N^2)$ 次 HBM 访问，而 FlashAttention 前向仅需 $\Theta(N^2 d^2 M^{-1})$ 次访问，<mark>额外显存占用从平方级降为线性 $O(N)$</mark>。在 A100 的端到端训练实测中，FlashAttention 将 BERT-large 训练时间比 MLPerf 1.1 记录缩短 15%（20.0 分钟降至 17.4 分钟），<mark>将 GPT-2 medium 训练时间从 Hugging Face 基线的 21.0 天缩短至 6.9 天</mark>，并让标准 Transformer 首次在序列长度 16K 的 Path-X 任务上跑通且拿到 61.4% 准确率。[论文，§1、定理 1–2、表 1–2、表 6](https://arxiv.org/pdf/2205.14135v2#page=5)

## 研究背景与问题定义

### 算术强度决定注意力卡在显存带宽而非浮点算力

**判断一个 GPU 算子受算力限制还是受显存带宽限制，看的不是总计算量，而是每读写一字节显存所能完成的浮点运算次数。**

论文以 NVIDIA A100 GPU 为例给出存储层级参数：片外 HBM 容量为 40–80 GB，带宽为 1.5–2.0 TB/s；全卡 108 个流多处理器（Streaming Multiprocessor, SM）各自拥有 192 KB 的片上 SRAM，合计带宽估计约 19 TB/s。片上 SRAM 的读写速度比 HBM 快约一个数量级，容量却小四个数量级以上。衡量操作在这两级存储上表现的指标是**算术强度（Arithmetic Intensity）**，即每次显存字节访问所执行的算术运算次数。大尺寸矩阵乘法算术强度高，耗时由浮点运算次数（Floating Point Operations, FLOPs，以下简称 FLOPs）决定，属于计算受限（compute-bound）；而注意力中的逐元素操作（掩码、Dropout）与归约操作（Softmax 行求和）每读写一个元素只做几次运算，<mark>耗时完全卡在 HBM 读写带宽上</mark>，属于显存带宽受限（memory-bound）。[论文，§2.1、图 1](https://arxiv.org/pdf/2205.14135v2#page=3)

![原文图 1：左为 GPU 存储层级与 FlashAttention 的内外层分块循环，右为 GPT-2 注意力各步骤在 PyTorch 与融合内核下的耗时对比](/images/papers/flash-attention/fig1-memory-hierarchy-tiling.png)

*图 1：左图展示 CPU DRAM、GPU HBM 与 GPU SRAM 的带宽和容量对比，以及外层装入 $K,V$ 块、内层遍历 $Q$ 块的分块流程；右图对比 GPT-2 注意力（$N=1024$）在 PyTorch 标准实现与 FlashAttention 单内核融合下的正反向分项耗时。截取自[Dao 等，2022，原文图 1](https://arxiv.org/pdf/2205.14135v2#page=2)。*

加速显存受限操作的常见手段是算子融合（Kernel Fusion）：把连续多个操作合并进同一个 [CUDA 内核](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)，数据从 HBM 读入 SRAM 后一口气算完，避免中间结果写回 HBM。但朴素编译器融合在模型训练阶段对注意力失效——因为反向传播求梯度仍然需要前向的中间激活值，编译器还是得把 $N\times N$ 的中间矩阵写回 HBM 保存。同理，此前许多近似注意力算法（稀疏近似与低秩近似）虽然把理论 FLOPs 降到了线性或近线性，却没有减少中间结果与不规则索引的 HBM 读写开销，导致计算量降低了，实际运行时间却往往没有变快。[论文，§1、§2.1](https://arxiv.org/pdf/2205.14135v2#page=1)

::: details 点击展开：稀疏近似与低秩近似为什么省了 FLOPs 却没省实际耗时

1. **稀疏近似（Sparse Approximation）**：假定 $N\times N$ 注意力矩阵中只有少数位置重要，仅计算局部窗口、固定步长或经聚类/哈希筛选出的位置（如 Reformer、Longformer），把计算量降为 $O(N\log N)$ 或 $O(N\sqrt{N})$。
2. **低秩近似（Low-Rank Approximation）**：假定注意力矩阵可由低秩结构逼近，将 $QK^{\mathsf T}$ 改写为低维投影或核函数随机特征展开（如 Linformer、Performer），把计算量降为 $O(Nk)$。
3. **未能转化为墙钟加速的原因**：两类方法都改变了注意力算子的数学定义；同时稀疏索引重排、哈希分桶或读写中间特征仍然需要频繁访问 HBM，且不规则访存无法像稠密矩阵乘法那样跑满 GPU 张量核心（Tensor Cores）。[论文，§1、§4.3](https://arxiv.org/pdf/2205.14135v2#page=1)

:::

### 标准实现把平方级中间矩阵在显存中往返搬运四次

**标准注意力的慢与爆显存来自同一件事：它把两张 $N\times N$ 的中间矩阵 $S$ 和 $P$ 完整写回 HBM，又从 HBM 完整读出。**

给定长度为 $N$、单头维度为 $d$ 的查询矩阵 $Q\in\mathbb{R}^{N\times d}$、键矩阵 $K\in\mathbb{R}^{N\times d}$ 与值矩阵 $V\in\mathbb{R}^{N\times d}$，设 $\tau$ 为缩放因子（通常取 $1/\sqrt{d}$），第 $i$ 个查询向量 $q_i$ 与第 $j$ 个键向量 $k_j$ 的打分为 $s_{ij}=\tau q_i k_j^{\mathsf T}$，按行归一化后对第 $j$ 个值向量 $v_j$ 加权求和：

$$
p_{ij} = \frac{\exp(s_{ij})}{\sum_{k=1}^{N} \exp(s_{ik})}, \qquad o_i = \sum_{j=1}^{N} p_{ij} v_j \tag{1}
$$

写成矩阵形式即打分矩阵 $S = \tau QK^{\mathsf T}\in\mathbb{R}^{N\times N}$、概率矩阵 $P = \operatorname{softmax}(S)\in\mathbb{R}^{N\times N}$（按行归一化）、输出矩阵 $O = PV\in\mathbb{R}^{N\times d}$。注意下标对应关系：第 $j$ 个键算出的权重 $p_{ij}$ 必须乘在同一位置的值向量 $v_j$ 上，因此键 $K$ 与值 $V$ 在位置维度 $j$ 上严格绑定。在常见模型中 $N \gg d$（例如 $N=1024, d=64$ 时，$S$ 和 $P$ 的元素个数 $N^2$ 是输入矩阵 $Nd$ 的 16 倍），而标准实现（算法 0）分三步串行调用算子：[论文，§2.2、算法 0](https://arxiv.org/pdf/2205.14135v2#page=4) <!-- derived -->

1. **算打分并写出 $S$**：从 HBM 读取 $Q, K$，算出 $S = QK^{\mathsf T}$ 后，将 $N\times N$ 的矩阵 $S$ 写回 HBM。
2. **读 $S$ 算归一化并写出 $P$**：从 HBM 读出 $S$，按行计算 $P = \operatorname{softmax}(S)$ 后，再将 $N\times N$ 的矩阵 $P$ 写回 HBM（含掩码与 Dropout 时还会增加逐元素读写）。
3. **读 $P$ 乘 $V$ 写出 $O$**：从 HBM 读出 $P$ 与 $V$，算出 $O = PV$ 后写回 HBM。

单是 $S$ 和 $P$ 两张大矩阵就在 HBM 上<mark>往返了四次</mark>，总访问量达 $\Theta(Nd + N^2)$。要彻底消除这四次平方级搬运，FlashAttention 必须依次解开两个核心硬约束：第一，在没有看到整行分数 $S_{i,:}$ 的前提下，如何分块算出对整行精确归一化的 Softmax 输出？第二，不在 HBM 中保存概率矩阵 $P$，反向传播如何完成梯度计算？[论文，§1、§2.2](https://arxiv.org/pdf/2205.14135v2#page=4)

::: details 点击展开：算法 0（标准注意力完整伪代码与点积缩放机制说明）

> **算法 0：标准注意力实现**（来源：[论文，§2.2 Algorithm 0](https://arxiv.org/pdf/2205.14135v2#page=4)）
> - **输入**：HBM 中的矩阵 $Q, K, V \in \mathbb{R}^{N\times d}$
> - **输出**：HBM 中的注意力输出矩阵 $O \in \mathbb{R}^{N\times d}$
>
> 1. 从 HBM 按块加载 $Q, K$，计算打分矩阵 $S = Q K^{\mathsf T}$
> 2. 将打分矩阵 $S \in \mathbb{R}^{N\times N}$ 写入 HBM
> 3. 从 HBM 读取 $S$，按行计算概率矩阵 $P = \operatorname{softmax}(S)$
> 4. 将概率矩阵 $P \in \mathbb{R}^{N\times N}$ 写入 HBM
> 5. 从 HBM 按块加载 $P$ 和 $V$，计算输出矩阵 $O = P V$
> 6. 将输出矩阵 $O \in \mathbb{R}^{N\times d}$ 写入 HBM
> 7. **return** $O$

- **四次平方级 HBM 读写统计**：写出 $S$（$N^2$）、读出 $S$ 并写出 $P$（$2N^2$）、再读出 $P$（$N^2$），合计产生 $4N^2 + 4Nd$ 次标量元素访问。以 GPT-2 的 $N=1024, d=64$ 为例，$Q,K,V,O$ 每个矩阵仅 $Nd = 65{,}536$ 个元素，而 $S$ 或 $P$ 单张矩阵就有 $N^2 = 1{,}048{,}576$ 个元素。<!-- derived -->
- **点积打分与缩放因子 $\tau$ 的作用**：$Q=XW_Q,\; K=XW_K,\; V=XW_V$ 由同一输入序列表示 $X\in\mathbb{R}^{N\times d_{\text{model}}}$ 乘可学习投影矩阵得到。训练过程通过反向传播调整 $W_Q, W_K$，使需要交互的位置对产生较大的代数内积 $q_i k_j^{\mathsf T}$；缩放因子 $\tau=1/\sqrt{d}$ 则用于防止高维内积方差过大导致 Softmax 指数进入梯度消失的饱和区。

:::

## 方法原理

### 在线 Softmax 用行最大值与指数和增量维护分母

**整个前向算法只有一个核心不变量：每一行 Softmax 的全局最大值基准与归一化分母，可以在分块扫描键向量的过程中用换基公式增量维护。**

为了解开第一个硬约束（不看完整行分数如何分块算 Softmax），先看分块求和为什么不能直接相加。数值稳定的 Softmax 会先从每个分数中减去当前行的最大值 $m$，使指数项 $e^{s - m} \le 1$，防止大数指数上溢为 $\infty$。当我们将键/值矩阵分块装入片上 SRAM 时，第 $j$ 块只能看到局部打分 $S_{ij} = Q_i K_j^{\mathsf T}$，算出的只是当前块的局部最大值 $\tilde{m}_{ij}$ 和局部指数和 $\tilde{\ell}_{ij}$。由于历史已处理块的旧最大值 $m_i$ 与当前块的 $\tilde{m}_{ij}$ 基准不同，两者的指数和不能直接相加。FlashAttention 借鉴 [Milakov 与 Gimelshein 的在线 Softmax 算法](https://arxiv.org/abs/1805.02867)，<mark>用换基系数 $e^{m_{\text{旧}} - m_{\text{新}}}$ 将新旧统计量折算到同一最大值基准</mark>，在算法 1 的每轮内循环中通过三步状态接力完成跨块合并：[论文，§3.1、算法 1](https://arxiv.org/pdf/2205.14135v2#page=4)

1. **算当前块局部统计量**：在 SRAM 内算出当前分数块 $S_{ij} = Q_i K_j^{\mathsf T}$，取每行局部最大值 $\tilde{m}_{ij}$，计算局部未归一化指数块 $\tilde{P}_{ij} = \exp(S_{ij} - \tilde{m}_{ij})$ 与局部行指数和 $\tilde{\ell}_{ij} = \operatorname{rowsum}(\tilde{P}_{ij})$。
2. **对齐指数基准并更新分母**：取新的行最大值 $m_i^{\mathrm{new}} = \max(m_i, \tilde{m}_{ij})$，将旧分母 $\ell_i$ 乘上换基系数 $e^{m_i - m_i^{\mathrm{new}}}$，与换基后的新块指数和 $e^{\tilde{m}_{ij} - m_i^{\mathrm{new}}}\tilde{\ell}_{ij}$ 相加，得到新分母 $\ell_i^{\mathrm{new}}$。
3. **还原旧分子、累加新块并重归一化**：旧部分输出 $O_i$ 在上一轮末尾已除过旧分母 $\ell_i$，因此先左乘 $\operatorname{diag}(\ell_i)$ 还原为未归一化分子并乘 $e^{m_i - m_i^{\mathrm{new}}}$ 换基，加上当前块换基后的加权和 $e^{\tilde{m}_{ij} - m_i^{\mathrm{new}}} \tilde{P}_{ij} V_j$，最后统一除以新分母 $\ell_i^{\mathrm{new}}$：

$$
O_i^{\mathrm{new}} = \operatorname{diag}(\ell_i^{\mathrm{new}})^{-1}\!\left(\operatorname{diag}(\ell_i) e^{m_i - m_i^{\mathrm{new}}} O_i + e^{\tilde m_{ij} - m_i^{\mathrm{new}}} \tilde P_{ij} V_j\right) \tag{2}
$$

当外循环扫完全部键/值块后，$m_i$ 和 $\ell_i$ 就是整行 $N$ 个分数的全局最大值与全局分母，$O_i$ 就是精确的注意力输出。定理 1 证明前向浮点运算量为 $O(N^2 d)$，除输入输出外仅需在 HBM 中存放长度为 $N$ 的统计向量 $m$ 和 $\ell$，<mark>额外显存从 $O(N^2)$ 降为 $O(N)$</mark>。[论文，§3.1、算法 1、定理 1](https://arxiv.org/pdf/2205.14135v2#page=5)

::: details 点击展开：在线 Softmax 跨块换基与输出递推式（式 2）的分步推导

1. **减去行最大值防止指数上溢（平移不变性）**：
   对任意单块向量 $x\in\mathbb{R}^B$，当分数较大时（例如 $x_a > 90$ 对 FP16/FP32）直接算 $e^{x_a}$ 会上溢为 $\infty$。令 $m(x) := \max_a x_a$，分子分母同乘 $e^{-m(x)}$ 后分式严格不变：
   $$
   \begin{aligned}
   \operatorname{softmax}(x)_a &= \frac{e^{x_a}}{\sum_{b=1}^{B} e^{x_b}} &&\text{（标准定义）} \\
   &= \frac{e^{x_a}\cdot e^{-m(x)}}{\left(\sum_{b=1}^{B} e^{x_b}\right)\cdot e^{-m(x)}} &&\text{（同乘 } e^{-m(x)}\text{）} \\
   &= \frac{e^{x_a - m(x)}}{\sum_{b=1}^{B} e^{x_b - m(x)}} &&\text{（合并指数）}
   \end{aligned}
   $$

2. **定义单块 Softmax 的三个基本统计量**：
   基于上式，论文对任意向量 $x\in\mathbb{R}^B$ 分别定义行最大值、未归一化指数向量与行指数和：[论文，§3.1](https://arxiv.org/pdf/2205.14135v2#page=4)
   $$
   \begin{aligned}
   m(x) &:= \max_a x_a &&\text{（块内行最大值）} \\
   f(x) &:= \begin{bmatrix} e^{x_1 - m(x)} & \cdots & e^{x_B - m(x)} \end{bmatrix} &&\text{（未归一化指数向量）} \\
   \ell(x) &:= \sum_{a=1}^{B} f(x)_a &&\text{（行指数和，即分母）}
   \end{aligned}
   $$
   于是单块的归一化结果可写为 $\operatorname{softmax}(x) = f(x)/\ell(x)$。

3. **两块拼接时的指数换基与分母合并**：
   将一行长度为 $2B$ 的分数拆为前后两个子块 $x = [x^{(1)}, x^{(2)}]\in\mathbb{R}^{2B}$，按以下步骤把两块的局部统计量合成全局统计量：
   - 扫描第 1 块，得到以 $m(x^{(1)})$ 为基准的局部向量 $f(x^{(1)})$ 与局部指数和 $\ell(x^{(1)})$。
   - 扫描第 2 块，得到以 $m(x^{(2)})$ 为基准的局部向量 $f(x^{(2)})$ 与局部指数和 $\ell(x^{(2)})$。
   - 利用指数恒等式 $e^{s - m(x)} = e^{s - m(x^{(1)})}\cdot e^{m(x^{(1)}) - m(x)}$，把两块换基后相加：
   $$
   \begin{aligned}
   m(x) &= \max\!\left(m(x^{(1)}),\; m(x^{(2)})\right) &&\text{（取新全局基准）} \\
   f(x) &= \begin{bmatrix} e^{m(x^{(1)}) - m(x)} f(x^{(1)}) & e^{m(x^{(2)}) - m(x)} f(x^{(2)}) \end{bmatrix} &&\text{（对齐到基准 } m(x)\text{）} \\
   \ell(x) &= e^{m(x^{(1)}) - m(x)}\ell(x^{(1)}) + e^{m(x^{(2)}) - m(x)}\ell(x^{(2)}) &&\text{（换基后求和）}
   \end{aligned}
   $$

4. **推广至矩阵块并推导部分输出更新式（式 2）**：
   在第 $j$ 轮外循环中，设查询块 $Q_i\in\mathbb{R}^{B_r\times d}$ 在前 $j-1$ 块累计的旧最大值为 $m_i$、旧指数和为 $\ell_i$、旧部分输出为 $O_i$。装入当前块 $(K_j, V_j)$ 算出 $\tilde m_{ij}, \tilde P_{ij}, \tilde \ell_{ij}$ 后，按以下步骤合成新输出：
   $$
   \begin{aligned}
   \operatorname{diag}(\ell_i)\, O_i &= \sum_{k < j} \exp(S_{ik} - m_i)\, V_k &&\text{（还原旧未归一化分子）} \\
   u_i^{\mathrm{old\to new}} &= e^{m_i - m_i^{\mathrm{new}}} \operatorname{diag}(\ell_i)\, O_i &&\text{（旧分子乘 } \alpha\text{ 换基）} \\
   u_i^{\mathrm{cur\to new}} &= e^{\tilde m_{ij} - m_i^{\mathrm{new}}} \tilde P_{ij} V_j &&\text{（新块分子乘 } \beta\text{ 换基）} \\
   O_i^{\mathrm{new}} &= \operatorname{diag}(\ell_i^{\mathrm{new}})^{-1}\!\left(u_i^{\mathrm{old\to new}} + u_i^{\mathrm{cur\to new}}\right) &&\text{（相加并重归一化）}
   \end{aligned}
   $$

> **注意**：式 (2) 第二项中的 $\tilde P_{ij} V_j$ 本身已经是当前块的未归一化加权分子 $\sum_{b} e^{S_{ij}[a,b]-\tilde m_{ij}[a]} V_j[b,:]$，不能像第一项那样再乘一次 $\tilde \ell_{ij}$。第一项左乘 $\operatorname{diag}(\ell_i)$ 只是为了抵消上一轮末尾已经除掉的旧分母。

:::

::: details 点击展开：算法 1（FlashAttention 前向完整伪代码与符号对照表）

为突出分块主干，论文正文算法 1 省去了缩放因子 $\tau$、掩码与 Dropout（含这些工程步骤的完整前向见论文附录 B 算法 2）：[论文，§3.1、算法 1](https://arxiv.org/pdf/2205.14135v2#page=5)

> **算法 1：FlashAttention 前向计算**（来源：[论文，§3.1 Algorithm 1](https://arxiv.org/pdf/2205.14135v2#page=5)）
> - **输入**：HBM 中的矩阵 $Q, K, V \in \mathbb{R}^{N\times d}$，容量为 $M$ 的片上 SRAM
> - **输出**：HBM 中的精确注意力矩阵 $O \in \mathbb{R}^{N\times d}$
>
> 1. 设置块大小：$B_c = \left\lceil \frac{M}{4d} \right\rceil$，$B_r = \min\!\left(\left\lceil \frac{M}{4d} \right\rceil, d\right)$
> 2. 在 HBM 中初始化：$O = (0)_{N\times d}$，$\ell = (0)_N$，$m = (-\infty)_N$
> 3. 将 $Q, O, \ell, m$ 按行划分为 $T_r = \left\lceil \frac{N}{B_r} \right\rceil$ 个块
> 4. 将 $K, V$ 按行划分为 $T_c = \left\lceil \frac{N}{B_c} \right\rceil$ 个块
> 5. **for** $1 \le j \le T_c$ **do**（外循环：遍历键/值块）
> 6. &emsp;从 HBM 加载 $K_j, V_j \in \mathbb{R}^{B_c \times d}$ 到片上 SRAM
> 7. &emsp;**for** $1 \le i \le T_r$ **do**（内循环：遍历查询块）
> 8. &emsp;&emsp;从 HBM 加载 $Q_i, O_i, \ell_i, m_i$ 到片上 SRAM
> 9. &emsp;&emsp;在片上计算当前块打分：$S_{ij} = Q_i K_j^{\mathsf T} \in \mathbb{R}^{B_r \times B_c}$
> 10. &emsp;&emsp;在片上计算局部最大值：$\tilde{m}_{ij} = \operatorname{rowmax}(S_{ij}) \in \mathbb{R}^{B_r}$
> 11. &emsp;&emsp;在片上计算局部指数块：$\tilde{P}_{ij} = \exp(S_{ij} - \tilde{m}_{ij}) \in \mathbb{R}^{B_r \times B_c}$
> 12. &emsp;&emsp;在片上计算局部指数和：$\tilde{\ell}_{ij} = \operatorname{rowsum}(\tilde{P}_{ij}) \in \mathbb{R}^{B_r}$
> 13. &emsp;&emsp;在片上更新行最大值：$m_i^{\mathrm{new}} = \max(m_i, \tilde{m}_{ij}) \in \mathbb{R}^{B_r}$
> 14. &emsp;&emsp;在片上更新行分母：$\ell_i^{\mathrm{new}} = e^{m_i - m_i^{\mathrm{new}}} \ell_i + e^{\tilde{m}_{ij} - m_i^{\mathrm{new}}} \tilde{\ell}_{ij}$
> 15. &emsp;&emsp;更新部分输出并写回：$O_i \leftarrow \operatorname{diag}(\ell_i^{\mathrm{new}})^{-1}\!\left(\operatorname{diag}(\ell_i) e^{m_i - m_i^{\mathrm{new}}} O_i + e^{\tilde{m}_{ij} - m_i^{\mathrm{new}}} \tilde{P}_{ij} V_j\right)$
> 16. &emsp;&emsp;将更新后的 $\ell_i \leftarrow \ell_i^{\mathrm{new}}$，$m_i \leftarrow m_i^{\mathrm{new}}$ 写回 HBM
> 17. &emsp;**end for**
> 18. **end for**
> 19. **return** $O$

| 符号 | 尺寸与存储位置 | 物理含义 |
|---|---|---|
| $B_c, B_r$ | 标量整数 | 单个键/值块的行数 $B_c = \lceil M/(4d)\rceil$，单个查询块的行数 $B_r = \min(\lceil M/(4d)\rceil, d)$ |
| $T_c, T_r$ | 标量整数 | 键/值总块数 $T_c = \lceil N/B_c\rceil$（外循环索引 $j$），查询总块数 $T_r = \lceil N/B_r\rceil$（内循环索引 $i$） |
| $O_i, \ell_i, m_i$ | $B_r\times d,\; B_r,\; B_r$（HBM $\leftrightarrow$ SRAM） | 第 $i$ 个查询块截至当前已处理键块的部分输出、累计指数和、累计行最大值 |
| $S_{ij}, \tilde P_{ij}$ | $B_r\times B_c$（仅在 SRAM） | 当前块分数矩阵 $S_{ij}=Q_i K_j^{\mathsf T}$，以及局部未归一化指数矩阵 $\tilde P_{ij}=\exp(S_{ij}-\tilde m_{ij})$ |
| $\tilde m_{ij}, \tilde \ell_{ij}$ | $B_r$（仅在 SRAM） | 当前分数块 $S_{ij}$ 每行的局部最大值 $\operatorname{rowmax}(S_{ij})$ 与局部指数和 $\operatorname{rowsum}(\tilde P_{ij})$ |

表中变量分为两类：带波浪号的 $\tilde m_{ij}, \tilde P_{ij}, \tilde \ell_{ij}$ 只是当前键块 $j$ 在片上的局部临时量，用完即弃；不带波浪号的 $m_i, \ell_i, O_i$ 则是跨块传递的三个累加器（上述第 10–15 行对应原论文算法 1 第 10–12 行的状态更新）。

:::

::: details 点击展开：手算算例（用 N=4, d=1 完整验证两轮分块换基与整行计算结果一致）

下面构造一组最小教学算例（非论文实验数据）：取序列长度 $N=4$、头维度 $d=1$、片上容量 $M=8$（对应块大小 $B_c=2,\; B_r=1$）。输入为 $Q = [1, 0, 0, 0]^{\mathsf T}$、$K = [1, 2, 3, 0]^{\mathsf T}$、$V = [10, 20, 30, 40]^{\mathsf T}$。按 $B_c=2$ 把键/值切为两块，重点追踪第 1 个查询行 $Q_1=[1]$ 在两轮外循环中的状态流转（其余三行均为 $[0]$，两轮后输出分别为 $15$ 与 $25$）：[论文，§3.1、算法 1](https://arxiv.org/pdf/2205.14135v2#page=5) <!-- derived -->

![在线 Softmax 跨块换基与状态合并示意：以查询行分数 [1, 2 | 3, 0] 与值向量 [10, 20 | 30, 40] 为例](/images/papers/flash-attention/online-softmax-rescaling.svg)

*图：算例中查询行 $Q_1=[1]$ 在两轮外循环中的状态流转。块 2 出现更大的分数 $3$ 后，块 1 的指数和 $\ell_1$ 与未归一化分子 $\ell_1 O_1$ 均乘以换基系数 $\alpha = e^{2-3} = e^{-1}$，再与块 2 相加。（自构教学算例示意图）*

| 外循环轮次 | 块内分数 $S_{1j}$ | 块内统计量 $(\tilde m_{1j}, \tilde P_{1j}, \tilde \ell_{1j})$ | 换基系数 $(\alpha, \beta)$ | 更新后写回 HBM 的 $(m_1, \ell_1, O_1)$ |
|---|---|---|---|---|
| 初始（$j=0$） | — | — | — | $(-\infty,\; 0,\; 0)$ |
| 第 1 轮（$j=1$） | $[1, 2]$ | $(2,\; [e^{-1}, 1],\; 1+e^{-1}\approx 1.3679)$ | $\alpha=0,\; \beta=1$ | $(2,\; 1.3679,\; 17.3106)$ |
| 第 2 轮（$j=2$） | $[3, 0]$ | $(3,\; [1, e^{-3}],\; 1+e^{-3}\approx 1.0498)$ | $\alpha=e^{-1},\; \beta=1$ | $(3,\; 1.5530,\; 26.2089)$ |

<!-- derived -->

下面分四步展示表中每一轮的逐项代入过程：

1. **第 1 步：计算块尺寸、切分输入并初始化 HBM 状态（对应算法 1 第 1–4 行）**
   - 计算块行数：$B_c = \lceil 8/(4\times 1)\rceil = 2$，$B_r = \min(2, 1) = 1$。<!-- derived -->
   - 切分第 1 块键/值：$K_1 = [1, 2]^{\mathsf T}$，$V_1 = [10, 20]^{\mathsf T}$。<!-- derived -->
   - 切分第 2 块键/值：$K_2 = [3, 0]^{\mathsf T}$，$V_2 = [30, 40]^{\mathsf T}$（共 $T_c = 4/2 = 2$ 块）。<!-- derived -->
   - 切分查询块（共 $T_r = 4$ 块）：$Q_1 = [1],\; Q_2 = [0],\; Q_3 = [0],\; Q_4 = [0]$。<!-- derived -->
   - 初始化 HBM 行状态：$O = [0, 0, 0, 0]^{\mathsf T},\; m = [-\infty, -\infty, -\infty, -\infty]^{\mathsf T},\; \ell = [0, 0, 0, 0]^{\mathsf T}$。<!-- derived -->

2. **第 2 步：外循环第 1 轮（$j=1$，装入 $K_1, V_1$，更新 $Q_1=[1]$）**
   - 片上算局部打分：$S_{11} = Q_1 K_1^{\mathsf T} = [1, 2]$。<!-- derived -->
   - 片上算局部最大值：$\tilde m_{11} = \max(1, 2) = 2$。<!-- derived -->
   - 片上算局部未归一化指数：$\tilde P_{11} = [e^{1-2}, e^{2-2}] = [e^{-1}, 1]$。<!-- derived -->
   - 片上算局部指数和：$\tilde \ell_{11} = e^{-1} + 1 \approx 1.3679$。<!-- derived -->
   - 算旧块换基系数：因初始 $m_1 = -\infty$，故 $\alpha = e^{-\infty - 2} = 0$。<!-- derived -->
   - 算新块换基系数：$\beta = e^{2-2} = 1$。<!-- derived -->
   - 更新全局基准与分母：$m_1 = 2,\; \ell_1 = 1 + e^{-1} \approx 1.3679$。<!-- derived -->
   - 计算第 1 轮部分输出 $O_1$：<!-- derived -->
   $$
   \begin{aligned}
   O_1 &= \frac{\tilde P_{11} V_1}{\ell_1} &&\text{（初始旧分子为 } 0\text{）} \\
   &= \frac{10e^{-1} + 20\cdot 1}{1 + e^{-1}} &&\text{（代入 } \tilde P_{11}, V_1\text{）} \\
   &\approx \frac{23.6788}{1.3679} &&\text{（分子分母分别求值）} \\
   &\approx 17.3106 &&\text{（第 1 轮部分输出）}
   \end{aligned}
   $$

3. **第 3 步：外循环第 2 轮（$j=2$，装入 $K_2, V_2$，换基合并 $Q_1=[1]$）**
   - 片上算局部打分：$S_{12} = Q_1 K_2^{\mathsf T} = [3, 0]$。<!-- derived -->
   - 片上算局部最大值：$\tilde m_{12} = \max(3, 0) = 3$。<!-- derived -->
   - 片上算局部未归一化指数：$\tilde P_{12} = [e^{3-3}, e^{0-3}] = [1, e^{-3}]$。<!-- derived -->
   - 片上算局部指数和：$\tilde \ell_{12} = 1 + e^{-3} \approx 1.0498$。<!-- derived -->
   - 刷新行最大值：$m_1^{\mathrm{new}} = \max(2, 3) = 3$。<!-- derived -->
   - 算旧块换基系数（基准从 $2$ 升到 $3$）：$\alpha = e^{2-3} = e^{-1} \approx 0.3679$。<!-- derived -->
   - 算新块换基系数：$\beta = e^{3-3} = 1$。<!-- derived -->
   - 合并新分母 $\ell_1^{\mathrm{new}}$：<!-- derived -->
   $$
   \begin{aligned}
   \ell_1^{\mathrm{new}} &= \alpha \ell_1 + \beta \tilde \ell_{12} &&\text{（分母换基合并式）} \\
   &= e^{-1}(1 + e^{-1}) + 1\cdot(1 + e^{-3}) &&\text{（代入各块统计量）} \\
   &= e^{-2} + e^{-1} + 1 + e^{-3} &&\text{（对齐全局基准 } m=3\text{）} \\
   &\approx 1.5530 &&\text{（得全局分母）}
   \end{aligned}
   $$
   - 合并新未归一化分子 $u_{\mathrm{new}}$ 并除以新分母得最终输出 $O_1^{\mathrm{new}}$：<!-- derived -->
   $$
   \begin{aligned}
   u_{\mathrm{new}} &= \alpha(\ell_1 O_1) + \beta(\tilde P_{12} V_2) &&\text{（旧分子换基后加新分子）} \\
   &= e^{-1}(10e^{-1} + 20) + 1\cdot(30\cdot 1 + 40e^{-3}) &&\text{（代入两块加权和）} \\
   &= 10e^{-2} + 20e^{-1} + 30 + 40e^{-3} &&\text{（对齐全局基准 } m=3\text{）} \\
   &\approx 40.7024 &&\text{（得全局未归一化分子）} \\
   O_1^{\mathrm{new}} &= \frac{u_{\mathrm{new}}}{\ell_1^{\mathrm{new}}} &&\text{（除以新分母）} \\
   &\approx \frac{40.7024}{1.5530} &&\text{（代入分子分母数值）} \\
   &\approx 26.2089 &&\text{（最终精确输出）}
   \end{aligned}
   $$

4. **第 4 步：与完整矩阵标准计算核对**
   若不切块，一次性读取整行分数 $S_{1,:} = [1, 2, 3, 0]$，全局最大值为 $m = 3$，按标准公式一步计算：
   $$
   \begin{aligned}
   O_1^{\mathrm{exact}} &= \frac{10e^{1-3} + 20e^{2-3} + 30e^{3-3} + 40e^{0-3}}{e^{1-3} + e^{2-3} + e^{3-3} + e^{0-3}} &&\text{（整行 Softmax 加权）} \\
   &= \frac{10e^{-2} + 20e^{-1} + 30 + 40e^{-3}}{e^{-2} + e^{-1} + 1 + e^{-3}} &&\text{（与分块结果完全一致）} \\
   &\approx 26.2089 &&\text{（数值结果相等）}
   \end{aligned}
   $$

:::

### 反向传播依靠行统计量在片上重算局部概率矩阵

**前向保存的 $m$ 和 $\ell$ 已经汇总了整行所有键的信息，因此反向传播只需在片上重算当前块的分数 $S_{ij}$，就能直接恢复全局精确概率 $P_{ij}$，无需在 HBM 中存储 $N\times N$ 的概率矩阵。**

为了解开第二个硬约束（不在 HBM 保存概率矩阵 $P$ 如何求梯度），先看反向传播依赖什么。已知损失对输出 $O$ 的梯度 $dO\in\mathbb{R}^{N\times d}$，求输入梯度 $dQ, dK, dV\in\mathbb{R}^{N\times d}$ 的每一步都依赖注意力概率矩阵 $P\in\mathbb{R}^{N\times N}$。如果前向把整张 $P$ 留在 HBM，前向省下的 $O(N^2)$ 显存就会前功尽弃。FlashAttention 利用两条代数简化，<mark>在片上按块重算概率并当场消费中间梯度</mark>：[论文，§3.1、附录 B.2、算法 4](https://arxiv.org/pdf/2205.14135v2#page=18)

1. **由前向最终行状态 $(m_i, \ell_i)$ 一步恢复全局概率块**：前向结束时保存在 HBM 中的 $m_i$ 和 $\ell_i$ 已经是看完全部 $N$ 个键之后的全局最大值与全局分母。反向将 $Q_i, K_j$ 读入 SRAM 重算当前分数块 $S_{ij} = Q_i K_j^{\mathsf T}$ 后，无需再次递推，一步就能恢复精确全局概率块：

$$
P_{ij} = \operatorname{diag}(\ell_i)^{-1} \exp(S_{ij} - m_i) \tag{3}
$$

2. **用前向输出 $O$ 消除 Softmax 反向的跨块求和**：Softmax 反向求导需要一项跨整行所有键的加权和 $D\in\mathbb{R}^N$。利用前向输出 $O = PV$ 的代数定义，该项可直接化简为输出梯度 $dO$ 与前向输出 $O$ 的哈达玛积（Hadamard Product，即逐元素乘积，记为 $\odot$）的行和：

$$
D = \operatorname{rowsum}(dO \odot O) \tag{4}
$$

在进入分块循环前，直接读取 HBM 中现成的 $dO$ 和 $O$，以 $O(Nd)$ 代价即可一次算完向量 $D$。由此，每一小块的概率 $P_{ij}$ 与中间梯度 $dP_{ij}, dS_{ij}$ 全在 SRAM 内重算、求导并累加到 $dQ, dK, dV$ 后即刻释放。定理 5 证明反向传播虽然多算了一次 $Q_i K_j^{\mathsf T}$ 和指数，却彻底免去了向 HBM 读写 $N\times N$ 矩阵的开销，<mark>反向 HBM 访问量同样压低为 $\Theta(N^2 d^2 M^{-1})$，额外显存保持 $O(N)$</mark>。[论文，附录 B.4 算法 4、附录 C 定理 5](https://arxiv.org/pdf/2205.14135v2#page=21)

::: details 点击展开：反向传播梯度链分步推导、$D_r$ 化简证明与算法 2 伪代码

以不含 Dropout 和缩放的简化形式展开反向求导链（含缩放 $\tau$、掩码与通过保存伪随机数生成器种子在片上重放 Dropout 掩码的完整工程流程见论文附录 B.4 算法 4）：[论文，附录 B.2、B.4](https://arxiv.org/pdf/2205.14135v2#page=18)

1. **由前向输出 $O = PV$ 求值梯度 $dV$ 与概率梯度 $dP$**：
   $$
   dV = P^{\mathsf T} dO, \qquad dP = dO\,V^{\mathsf T}
   $$
2. **由行内归一化 $P = \operatorname{softmax}(S)$ 求分数梯度 $dS$**（对第 $r$ 行、第 $t$ 列）：
   $$
   dS_{rt} = p_{rt}\!\left(dP_{rt} - D_r\right), \qquad \text{其中 } D_r := \sum_{u=1}^{N} p_{ru}\, dP_{ru}
   $$
3. **由打分矩阵 $S = QK^{\mathsf T}$ 求查询梯度 $dQ$ 与键梯度 $dK$**：
   $$
   dQ = dS\,K, \qquad dK = dS^{\mathsf T} Q
   $$
4. **分步推导行内求和项 $D_r = \operatorname{rowsum}(dO_r \odot o_r)$**：
   由第 1 步 $dP = dO\,V^{\mathsf T}$ 可知，第 $r$ 行、第 $u$ 列的标量元素为 $dP_{ru} = dO_r v_u^{\mathsf T}$（其中 $dO_r, v_u, o_r\in\mathbb{R}^{1\times d}$ 均为行向量）。将其代入 $D_r$ 定义：
   $$
   \begin{aligned}
   D_r &= \sum_{u=1}^{N} p_{ru}\, dP_{ru} &&\text{（加权和定义）} \\
   &= \sum_{u=1}^{N} p_{ru} \left(dO_r v_u^{\mathsf T}\right) &&\text{（代入 } dP_{ru} = dO_r v_u^{\mathsf T}\text{）} \\
   &= dO_r \cdot \left(\sum_{u=1}^{N} p_{ru} v_u\right)^{\mathsf T} &&\text{（提出公因子 } dO_r\text{）} \\
   &= dO_r \cdot o_r^{\mathsf T} &&\text{（括号内即 } o_r\text{）} \\
   &= \operatorname{rowsum}(dO_r \odot o_r) &&\text{（改写为逐元素乘积行和）}
   \end{aligned}
   $$

将上述四步嵌入内外层分块循环，即得 **算法 2**（原文附录 B.4 算法 4 简化版）：

> **算法 2：FlashAttention 反向传播核心流程**（来源：[论文，附录 B.4 Algorithm 4 简化版](https://arxiv.org/pdf/2205.14135v2#page=20)）
> - **输入**：HBM 中的矩阵 $Q, K, V, O, dO \in \mathbb{R}^{N\times d}$，前向保存的全局行统计向量 $\ell, m \in \mathbb{R}^N$
> - **输出**：HBM 中的梯度矩阵 $dQ, dK, dV \in \mathbb{R}^{N\times d}$
>
> 1. 在 HBM 中初始化梯度矩阵：$dQ = (0)_{N\times d}$，$dK = (0)_{N\times d}$，$dV = (0)_{N\times d}$
> 2. 在 HBM 中预计算行内点积向量：$D = \operatorname{rowsum}(dO \odot O) \in \mathbb{R}^N$
> 3. 将 $Q, O, dO, dQ, \ell, m, D$ 按行划分为 $T_r$ 块；将 $K, V, dK, dV$ 按行划分为 $T_c$ 块
> 4. **for** $1 \le j \le T_c$ **do**（外循环：遍历键/值块）
> 5. &emsp;从 HBM 加载 $K_j, V_j$ 到 SRAM，初始化片上累加器 $\tilde{dK}_j = (0)_{B_c \times d}$，$\tilde{dV}_j = (0)_{B_c \times d}$
> 6. &emsp;**for** $1 \le i \le T_r$ **do**（内循环：遍历查询块）
> 7. &emsp;&emsp;从 HBM 加载 $Q_i, O_i, dO_i, dQ_i, \ell_i, m_i, D_i$ 到片上 SRAM
> 8. &emsp;&emsp;在片上重算打分块：$S_{ij} = Q_i K_j^{\mathsf T} \in \mathbb{R}^{B_r \times B_c}$
> 9. &emsp;&emsp;在片上恢复全局概率块：$P_{ij} = \operatorname{diag}(\ell_i)^{-1} \exp(S_{ij} - m_i)$
> 10. &emsp;&emsp;在片上累加值梯度：$\tilde{dV}_j \leftarrow \tilde{dV}_j + P_{ij}^{\mathsf T} dO_i$
> 11. &emsp;&emsp;在片上计算概率梯度：$dP_{ij} = dO_i V_j^{\mathsf T} \in \mathbb{R}^{B_r \times B_c}$
> 12. &emsp;&emsp;在片上计算分数梯度：$dS_{ij} = P_{ij} \odot (dP_{ij} - D_i)$
> 13. &emsp;&emsp;更新 HBM 中的查询梯度：$dQ_i \leftarrow dQ_i + dS_{ij} K_j$
> 14. &emsp;&emsp;在片上累加键梯度：$\tilde{dK}_j \leftarrow \tilde{dK}_j + dS_{ij}^{\mathsf T} Q_i$
> 15. &emsp;**end for**
> 16. &emsp;将片上累加完毕的 $\tilde{dK}_j, \tilde{dV}_j$ 写回 HBM 的 $dK_j, dV_j$
> 17. **end for**
> 18. **return** $dQ, dK, dV$

:::

### 外层遍历键值块将片外访问量压低到与块大小成反比

**键值同下标配对决定了计算结果是否正确，而外层遍历键值块、内层遍历查询块的顺序决定了在有限 SRAM 容量下能把 HBM 读写次数压到多低。**

既然前向和反向都通过分块消除了 $N\times N$ 中间矩阵，最后需要回答：分块之后总 HBM 访问量降到了多少？为什么算法 1 选择外循环遍历键/值块、内循环遍历查询块？结论分两层：

1. **循环顺序不改变数学结果，唯有键与值的同位置配对不可破坏**：只要计算打分的键块 $K_j$ 与加权求和的值块 $V_j$ 保持相同位置块号 $j$，并对每个查询行合并完所有键块，先固定键/值块还是先固定查询块只是调换有限求和与在线合并的次序，算出的注意力矩阵完全相同。[论文，§2.2、算法 1](https://arxiv.org/pdf/2205.14135v2#page=5)
2. **片上分块约束使外层遍历键值块的重复读写轮数更少**：片上 SRAM 容量 $M$ 需要同时装下输入块、输出块与尺寸为 $B_r\times B_c$ 的中间分数块。论文据此取键/值块大小 $B_c = \Theta(M/d)$、查询块大小 $B_r = \min(\Theta(M/d), d)$。当片上容量较大使 $B_c > B_r$ 时，键/值总块数 $T_c = \lceil N/B_c\rceil$ 少于查询总块数 $T_r = \lceil N/B_r\rceil$。<mark>把块数更少的键/值块放在外循环，整套 $K, V$ 只从 HBM 读一次</mark>，内循环的 $Q, O$ 仅随外循环重复读写 $T_c = \Theta(Nd/M)$ 轮。[论文，§3.2、定理 2、附录 C](https://arxiv.org/pdf/2205.14135v2#page=6)

| 实现方案 | 核心 HBM 读写行为 | 渐近 HBM 访问复杂度 | 额外显存复杂度 |
|---|---|---|---|
| **标准注意力（算法 0）** | 读写 $Q, K, V, O$（$\Theta(Nd)$），并四次完整读写 $N\times N$ 的 $S$ 与 $P$ | $\Theta(Nd + N^2)$ | $O(N^2)$ |
| **FlashAttention（算法 1）** | 读 $K, V$ 一次（$\Theta(Nd)$），内循环随外循环重复读写 $Q, O$ 共 $T_c = \Theta(Nd/M)$ 轮 | <mark>$\Theta(N^2 d^2 M^{-1})$</mark> | <mark>$O(N)$</mark> |

对比上表可知：由于 $T_c = \Theta(Nd/M)$，FlashAttention 的平方项 HBM 访问量相比标准实现的 $\Theta(N^2)$ <mark>缩减了 $\Theta(M/d^2)$ 倍</mark>——片上块越大，片外往返越少。论文命题 3 进一步证明了 IO 下界：在任意片上容量 $M\in[d, Nd]$ 下，不存在能对所有 $M$ 渐近低于 $\Omega(N^2 d^2 M^{-1})$ 次 HBM 访问的精确注意力算法。[论文，§3.2、定理 2、命题 3、附录 C](https://arxiv.org/pdf/2205.14135v2#page=6)

::: details 点击展开：SRAM 分块尺寸推导、N=1024 访问次数核算与 FlashAttention-2 循环顺序对比

1. **由 SRAM 容量 $M$ 推导块大小 $B_c$ 与 $B_r$（论文 §3.2 定理 2 证明）**：
   - **容纳输入与输出块**：片上 SRAM 需要同时装下 $K_j, V_j\in\mathbb{R}^{B_c\times d}$（各占 $B_c d$ 个元素）以及 $Q_i, O_i\in\mathbb{R}^{B_r\times d}$（各占 $B_r d$ 个元素）。取 $B_c = \lceil M/(4d)\rceil = \Theta(M/d)$ 且 $B_r \le \lceil M/(4d)\rceil$，可保证这四个矩阵块的总元素数不超过 $M$。[论文，§3.2、附录 C](https://arxiv.org/pdf/2205.14135v2#page=23)
   - **容纳片上中间分数块**：片上还需存放尺寸为 $B_r\times B_c$ 的分数块 $S_{ij}$ 与未归一化指数块 $\tilde P_{ij}$，要求 $B_r B_c = O(M)$。由于 $B_c = \Theta(M/d)$，这要求 $B_r = O(M / B_c) = O(d)$。
   - **综合取最小值**：同时满足以上两条约束，即得 $B_r = \min(\lceil M/(4d)\rceil, d)$。当 $M > 4d^2$ 时必有 $B_c > B_r$，从而外循环轮数 $T_c = \lceil N/B_c\rceil < T_r = \lceil N/B_r\rceil$。

2. **用 $N=4, d=1$ 算例验证循环顺序与错位反例**：
   - **调换内外循环结果不变**：若改为外层固定 $Q_1=[1]$，内层第 1 步读 $(K_1, V_1)$ 得 $(m_1=2, \ell_1\approx 1.3679, O_1\approx 17.3106)$，第 2 步读 $(K_2, V_2)$ 换基合并，最终同样得到 $O_1\approx 26.2089$。<!-- derived -->
   - **破坏 $K_j, V_j$ 同位置绑定的错误后果**：若错拿 $K_1=[1,2]^{\mathsf T}$ 算出的权重去乘 $V_2=[30,40]^{\mathsf T}$，第 1 块输出就会错算为 $(30e^{-1}+40)/(1+e^{-1})\approx 37.3106$，违背注意力定义式 (1)。<!-- derived -->

3. **在 $N=1024, d=64, M=65{,}536$ 下分步核算前向 HBM 元素访问次数**：
   - **第 1 步（计算基础矩阵规模）**：输入/输出单矩阵元素数 $Nd = 1024 \times 64 = 65{,}536$，完整注意力矩阵元素数 $N^2 = 1024^2 = 1{,}048{,}576$。<!-- derived -->
   - **第 2 步（计算外循环轮数）**：键/值块大小 $B_c = \lceil 65{,}536/(4\times 64)\rceil = 256$，外循环轮数 $T_c = 1024/256 = 4$。<!-- derived -->
   - **第 3 步（核算标准注意力访问量）**：<!-- derived -->
     $$
     \begin{aligned}
     \mathrm{IO}_{\mathrm{std}} &= 4Nd + 4N^2 &&\text{（算法 0 访问总式）} \\
     &= 4(65{,}536) + 4(1{,}048{,}576) &&\text{（代入 } Nd, N^2\text{）} \\
     &= 4{,}456{,}448 \text{ 个元素} &&\text{（求和结果）}
     \end{aligned}
     $$
   - **第 4 步（核算 FlashAttention 访问量）**：<!-- derived -->
     $$
     \begin{aligned}
     \mathrm{IO}_{\mathrm{flash}} &= 3Nd + 2N + T_c(3Nd + 4N) &&\text{（算法 1 访问总式）} \\
     &= 3(65{,}536) + 2(1024) + 4\big[3(65{,}536) + 4(1024)\big] &&\text{（代入 } T_c=4, N, d\text{）} \\
     &= 1{,}001{,}472 \text{ 个元素} &&\text{（求和结果）}
     \end{aligned}
     $$
   - **第 5 步（对比倍数）**：在该教学计数口径下，标准实现的前向 HBM 访问次数约为 FlashAttention 的 $4{,}456{,}448 / 1{,}001{,}472 \approx 4.45$ 倍（论文图 2 实测含正反向与完整内核开销，报告了从 40.3 GB 到 4.4 GB 的约 9 倍字节缩减）。<!-- derived -->

4. **与后续工作 FlashAttention-2 循环顺序的区别**：
   后续工作 FlashAttention-2 在重新调整块尺寸与线程块分工后，将前向循环改写为外层遍历 $Q$ 块、内层遍历 $K/V$ 块，使 $O_i, m_i, \ell_i$ 全程留在片上寄存器中累加、最后只写回 HBM 一次。但在本篇 FlashAttention（2022）的算法 1 与定理 2 中，外层遍历 $K/V$、内层遍历 $Q$ 并按 $T_c = \Theta(Nd/M)$ 统计重读次数，是原文的确切设计。

:::

## 实验与证据

### 图 2 与图 3 证实耗时随显存读写下降且显存呈线性增长

**在 GPT-2 medium 注意力基准上，FlashAttention 的浮点计算量比标准实现多出 13%，但因 HBM 读写量降到九分之一，正反向总耗时降到了原来的六分之一。**

![原文图 2：左表对比标准注意力与 FlashAttention 的 GFLOPs、HBM 读写与耗时；中图展示块大小对 HBM 访问与前向耗时的影响；右图展示块稀疏比例与耗时关系](/images/papers/flash-attention/fig2-io-and-runtime.png)

*图 2：左表在单张 A100 GPU 上测量 GPT-2 medium 注意力（序列长度 $N=1024$，头维度 $d=64$，16 个头，批量大小 64，含正反向）；中图在相同配置下改变分块大小 $B_c$ 测量前向 HBM 访问量与耗时；右图在 $N=4096$ 下改变块稀疏注意力的非零块比例。截取自[Dao 等，2022，原文图 2](https://arxiv.org/pdf/2205.14135v2#page=6)。*

图 2 直接验证了前文的两条理论主线：[论文，§3.2、图 2](https://arxiv.org/pdf/2205.14135v2#page=6)
- **耗时跟着 IO 走，不跟着 FLOPs 走（图 2 左表）**：反向重算使总计算量从 66.6 GFLOPs 增加到 75.2 GFLOPs（+13%），但消除中间矩阵往返后，<mark>HBM 读写量从 40.3 GB 降到 4.4 GB（缩减约 9 倍）</mark>，<mark>正反向总耗时从 41.7 ms 降至 7.3 ms（提速近 6 倍）</mark>。
- **块大小增大同步压低 IO 与耗时（图 2 中图）**：当分块大小从 64 增至 256 时，外循环轮数 $T_c$ 减小，HBM 访问量与前向耗时同步下降；超过 256 继续增至 512 时，算子转为受算力或片上资源制约，耗时曲线趋于平缓。

![原文图 3：左图为不同序列长度下各类注意力方法的正反向耗时对比，右图为注意力显存占用随序列长度的变化](/images/papers/flash-attention/fig3-runtime-and-memory.png)

*图 3：在单张 40 GB A100 GPU（批量大小 16，8 个头，头维度 $d=64$）上，左图对比序列长度从 128 到 8192 的正反向耗时（对数坐标），右图对比序列长度至 64K 的注意力显存占用。截取自[Dao 等，2022，原文图 3](https://arxiv.org/pdf/2205.14135v2#page=9)。*

图 3 进一步对比了不同序列长度下的运行时间与显存曲线：[论文，§4.3、图 3、附录 E.6](https://arxiv.org/pdf/2205.14135v2#page=9)
- **短序列快于近似注意力，长序列由块稀疏接棒（图 3 左图）**：在 $N \in [128, 512]$ 区间，稠密 FlashAttention 不仅比 PyTorch 标准注意力快达 3 倍，甚至比 Linformer、Performer 等近似注意力更快；当 $N > 1024$ 后二次方计算量开始主导耗时（出现交叉点），而跳过零块的块稀疏 FlashAttention（Block-Sparse FlashAttention）在全序列长度上均快于所有基线。
- **显存从二次方暴涨变为线性增长（图 3 右图）**：标准精确注意力因保存 $N\times N$ 矩阵很快触发显存溢出（OOM），而 FlashAttention 的注意力显存随序列长度呈线性增长，<mark>比精确基线节省最高达 20 倍显存</mark>，直至 64K 序列仍未耗尽 40 GB 显存。

### 显存节省转化为端到端训练加速与长上下文任务收益

**在保持完全相同的注意力计算定义与模型配置时，FlashAttention 只加速训练而不改变模型指标；当利用它省下的显存把上下文拉长到 4K–64K 时，模型才能获得更低的困惑度与更高的长序列任务准确率。**

| 实验任务与配置 | 对照基线 | FlashAttention | 结论与边界 |
|---|---|---|---|
| **BERT-large**（512，8×A100-80GB，达 72.0% 准确率） | MLPerf 1.1：20.0 ± 1.5 分钟 | **17.4 ± 1.4 分钟** | 同精度目标训练时间缩短 13%（论文称提速 15%） |
| **GPT-2 small**（1K，8×A100-40GB） | HF：PPL 18.2，9.5 天；Megatron：PPL 18.2，4.7 天 | **PPL 18.2，2.7 天** | 固定 1K 时指标一致，<mark>比 HF 快 3.5 倍、比 Megatron 快 1.7 倍</mark> |
| **GPT-2 medium**（1K，8×A100-40GB） | HF：PPL 14.2，21.0 天；Megatron：PPL 14.3，11.5 天 | **PPL 14.3，6.9 天** | 固定 1K 时指标一致，<mark>比 HF 快 3.0 倍、比 Megatron 快 1.7 倍</mark> |
| **GPT-2 small 扩长上下文**（1K→4K，8×A100-40GB） | Megatron（1K）：PPL 18.2，4.7 天 | **4K：PPL 17.5，3.6 天** | 4K 仍比 1K Megatron 快 30%，且 <mark>PPL 从 18.2 降至 17.5</mark> |
| **Long-Range Arena**（1K–4K，5 项均值） | 标准 Transformer：59.3%，1.0× | **稠密：59.8%，2.4×；块稀疏：59.6%，2.8×** | 保持同等准确率并提供 2.4–2.8 倍加速 |
| **超长序列下游任务**（MIMIC 16K / ECtHR 8K / Path-X 16K / Path-256 64K） | 512 基线：MIMIC 52.8，ECtHR 72.2；Path 系列均 OOM 或随机猜测 | **MIMIC 57.1（+4.3）；ECtHR 80.7（+8.5）；Path-X 61.4%；Path-256 63.1%** | 线性显存突破 16K–64K 上下文上限，显著提升长依赖指标 |

上表汇总自论文 §4.1–§4.2（BERT-large 为 10 次均值；GPT-2 均在 OpenWebText 评测，困惑度 PPL 越低表示预测越准确）。解读上表时必须严格区分两类因果归属：在固定 1K 上下文时（表 2），FlashAttention 与 Megatron-LM 算出完全相同的困惑度，因为精确注意力算子本身不改变数学函数；而在扩长上下文实验（表 4–6）中困惑度下降 0.7 与 Path-X 16K 的突破，则是因为<mark>$O(N)$ 线性显存允许将训练序列拉长</mark>，让模型看到了更长的前文信息。[论文，§4.1–4.2、表 1–6](https://arxiv.org/pdf/2205.14135v2#page=7)

::: details 点击展开：困惑度（PPL）的数学定义与采样温度的区别

1. **困惑度（Perplexity, PPL）的分步计算定义**：
   - **第 1 步（求真实词预测概率）**：设验证序列有 $L$ 个位置，模型在给定前文 $w_{<t}$ 时输出词表上的未归一化打分（logits）$z_t$，经 $\operatorname{softmax}(z_t)$ 得到真实下一个 token $w_t$ 的预测概率 $p(w_t \mid w_{<t})$。
   - **第 2 步（求平均负对数似然并取指数）**：对全序列的负对数似然（交叉熵损失）取平均后再取指数：
   $$
   \mathrm{PPL} = \exp\!\left(-\frac{1}{L}\sum_{t=1}^{L} \log p(w_t \mid w_{<t})\right)
   $$
   - **第 3 步（判读方向）**：模型对真实后续词分配的概率 $p(w_t \mid w_{<t})$ 越高，括号内的平均交叉熵损失越小，指数化后的 **PPL 数值就越低**。

2. **评估困惑度与推理采样温度（Temperature, $T$）的区别**：
   - **阶段不同**：生成推理时调节温度是在输出层计算 $\operatorname{softmax}(z_t / T)$（$T < 1$ 使分布更尖锐、输出更确定；$T > 1$ 使分布更平坦、采样更多样）；而论文表 2 和表 4 报告的困惑度是在固定 $T=1$ 下对验证集真实文本计算的统计损失。
   - **含义边界**：低困惑度代表模型拟合训练分布的预测能力更强，不直接等同于开放式生成时的创造性。[论文，§4.1–4.2、表 2、表 4](https://arxiv.org/pdf/2205.14135v2#page=8)

:::

## 局限性

**稠密 FlashAttention 消除了平方级的显存读写，却没有减少平方级的浮点乘加次数；当序列长度或头维度超出片上分块甜点区时，算力和硬件资源会重新成为瓶颈。**

1. **稠密版本的计算复杂度仍是 $O(N^2 d)$**：对于不跳过任何位置的稠密精确注意力，算法仍需遍历全部 $T_r \times T_c$ 个分块配对。图 3 左图显示，当序列长度超过 1024 后，二次方计算量使稠密 FlashAttention 的耗时高于线性近似方法。论文提出的块稀疏版本将 IO 复杂度降为 $\Theta(Nd + N^2 d^2 M^{-1} s)$（$s$ 为非零块比例），但那是针对预设稀疏掩码定义的近似注意力，不再等价于稠密注意力。[论文，§3.3、§4.3、命题 4](https://arxiv.org/pdf/2205.14135v2#page=6)
2. **受片上 SRAM 容量 $M$ 与头维度 $d$ 制约**：分块尺寸 $B_c = \lceil M/(4d)\rceil$ 与 $d$ 成反比、与 $M$ 成正比。论文附录 E.4–E.5 的实测表明，当头维度从 $d=64$ 增大到 $d=128$，或从 A100（每 SM 192 KB SRAM）换到 SRAM 更小的 T4 GPU 时，为了放进片上存储必须缩小块大小，导致外循环次数增加、实际加速比下降。[论文，附录 E.4–E.5、表 7、图 5–8](https://arxiv.org/pdf/2205.14135v2#page=27)
3. **算子工程与多卡通信边界**：作者在 §5 指出，将注意力融合为单个 CUDA 内核意味着每新增一种注意力变体就需重新编写底层 CUDA 代码，且针对特定 GPU 架构调优的内核参数不能直接跨代迁移；此外，文中的 IO 复杂度仅建模单卡内 HBM 与 SRAM 的数据搬运，未计入多 GPU 分布式训练时的跨卡通信开销，也未评测自回归推理中逐 token 解码（KV Cache 阶段，$Q$ 长度仅为 1）的负载特征。[论文，§5](https://arxiv.org/pdf/2205.14135v2#page=10)

## 结论

FlashAttention 建立了一条清晰的工程与理论主线：在现代 GPU 上，标准注意力的主要耗时与显存开销来自把 $N\times N$ 的分数矩阵 $S$ 与概率矩阵 $P$ 反复读写于片外 HBM。前向通过分块（Tiling）与在线 Softmax 的换基恒等式，仅靠每行的最大值 $m$、指数和 $\ell$ 与部分输出 $O$ 就在片上 SRAM 内增量合成出精确注意力输出；反向传播通过重算（Recomputation）与 $D = \operatorname{rowsum}(dO \odot O)$ 化简，以增加约 13% 浮点运算量为代价，将前反向 HBM 访问量压低到 $\Theta(N^2 d^2 M^{-1})$，并将额外显存从 $O(N^2)$ 降为 $O(N)$。判断该算法在具体场景下的收益时，只需核对三项条件：任务是否受限于 $N\times N$ 矩阵的 HBM 读写与显存占用、头维度 $d$ 与 GPU 片上 SRAM 容量 $M$ 是否允许足够大的分块，以及序列长度是否已进入二次方计算量主导的区间。[论文，§3.1–3.2、§4.3、§5](https://arxiv.org/pdf/2205.14135v2#page=5)

## 延伸阅读

- **FlashAttention 原论文**：Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré, [*FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*](https://arxiv.org/abs/2205.14135), NeurIPS 2022（[论文，全文与附录](https://arxiv.org/pdf/2205.14135v2#page=1)）。
- **FlashAttention 官方代码仓库**：[Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)（原 `HazyResearch/flash-attention`，包含论文 CUDA 内核实现与后续版本）。
- **在线 Softmax 数值稳定递推**：Maxim Milakov, Natalia Gimelshein, [*Online normalizer calculation for softmax*](https://arxiv.org/abs/1805.02867)（论文 §3.1 在线换基公式的前置方法）。
- **显存节省与自注意力分块前驱工作**：Markus N. Rabe, Charles Staats, [*Self-attention Does Not Need $O(n^2)$ Memory*](https://arxiv.org/abs/2112.05682)（提出了省去 $O(N^2)$ 中间显存的分块思路，FlashAttention 在此基础上针对 GPU SRAM/HBM 做了 IO 复杂度优化与单内核融合）。
- **FlashAttention-2（循环顺序与并行切分改进）**：Tri Dao, [*FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning*](https://arxiv.org/abs/2307.08691)（将前向循环改写为外层遍历 $Q$、内层遍历 $K/V$，减少非矩阵乘法指令并提升序列维度并行度）。
- **GPU 算术强度与 Roofline 性能模型**：Samuel Williams, Andrew Waterman, David Patterson, [*Roofline: An Insightful Visual Performance Model for Multicore Architectures*](https://dl.acm.org/doi/10.1145/1498765.1498785), Communications of the ACM（论文 §2.1 区分计算受限与显存带宽受限的理论基础）。
