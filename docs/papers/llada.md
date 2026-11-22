---
title: LLaDA：以掩码扩散取代自回归的 8B 语言模型
description: 精读 Nie 等人的 LLaDA 论文（arXiv:2502.09992v3），拆解随机掩码与 1/t 似然上界、低置信度重掩码采样及双向架构取舍如何支撑 8B 扩散语言模型追平同规模自回归基线并打破反转诅咒。
---

# LLaDA：以掩码扩散取代自回归的 8B 语言模型

这份报告精读中国人民大学与蚂蚁集团团队发表于 NeurIPS 2025 的论文《Large Language Diffusion Models》（简称 LLaDA），所用依据为 `arXiv:2502.09992v3`（2025 年 10 月 18 日版本）。围绕「大语言模型的核心能力究竟来自自回归分解，还是来自最大似然生成原则」这一问题，文章拆解 LLaDA 从头预训练与微调的三大支柱：以随机掩码率 $t \sim U[0, 1]$ 与 $1/t$ 加权交叉熵构建负对数似然上界；以低置信度重掩码完成时间无关的多步逆向解码；以及无因果掩码带来的 KV 缓存失效、固定画布长度控制与算力扩展规律。报告严格限于该论文实证范围，对论文未实现的强化学习（Reinforcement Learning, RL）对齐、KV 缓存系统优化及大于 $10^{23}$ FLOPs 的同数据集对照仅作边界记录。

## 主要工作

**LLaDA 证明了不依赖从左到右自回归分解的纯掩码扩散模型，在从零扩展到 8B 参数后同样具备可扩展性、上下文学习与指令遵循能力，并在反向推理任务上超越主流自回归模型。**

围绕这一判断，论文完成了三项可核验的工作：

1. **建立有理论依据的 8B 掩码扩散训练管线**：以不带因果掩码的 Transformer 作为**掩码预测器（Mask Predictor）**，在 2.3 万亿（2.3T）词元上从零预训练（消耗 0.13 百万 H800 GPU 小时），随后在 4.5M 条指令数据对上完成监督微调（Supervised Fine-Tuning, SFT），全程仅使用单次运行、未针对 LLaDA 做超参数搜索或 RL 对齐（[论文，§1、§2.2–2.3](https://arxiv.org/pdf/2502.09992v3#page=2)）。
2. **验证 $10^{23}$ FLOPs 量级的扩展律与基线对齐**：在相同预训练数据与最高接近 $10^{23}$ FLOPs 的算力预算下，LLaDA 在六项标准任务上的扩展曲线与自建的**自回归模型**（Autoregressive Model, ARM）基线持平甚至在 MMLU、GSM8K 上更陡（[论文，§3.1、图 3](https://arxiv.org/pdf/2502.09992v3#page=6)）。8B 预训练基座在 15 项零/少样本基准上全面领先 LLaMA2 7B Base，整体与训练量达 15T 词元的 LLaMA3 8B Base 相当（[论文，§3.2、表 1](https://arxiv.org/pdf/2502.09992v3#page=7)）。
3. **打破自回归的反转诅咒**：在 496 对中文名诗句的零样本正反向补全评测中，<mark>LLaDA 8B Instruct 取得正向 51.8、反向 45.6 的均衡得分，反向任务大幅领先 GPT-4o（34.3）与 Qwen2.5-7B Instruct（38.0）</mark>（[论文，§3.3、表 4](https://arxiv.org/pdf/2502.09992v3#page=9)）。

## 研究背景与问题定义

### 缩放与指令能力归因于生成建模原则，而非自回归分解

**大型语言模型的能力根基是「逼近真实语言分布」的最大似然生成原则，而不是逐词从左到右的链式乘积。**

大语言模型训练要解决的核心目标，是让参数化模型分布 $p_\theta(x)$ 贴近未知的真实语言分布 $p_{\mathrm{data}}(x)$，即最大化整条序列 $x=(x^1,\dots,x^L)$ 的对数似然，等价于最小化两个分布之间的 KL 散度（[论文，§1 式 (1)](https://arxiv.org/pdf/2502.09992v3#page=1)）：

$$\max_\theta \mathbb{E}_{p_{\mathrm{data}}(x)} \log p_\theta(x) \;\Longleftrightarrow\; \min_\theta \mathrm{KL}\big(p_{\mathrm{data}}(x) \,\|\, p_\theta(x)\big) \tag{1}$$

这里的 $p_\theta(x)$ 指的是**整条序列的联合概率**，而非单个词表的 Softmax 概率。主流 ARM 之所以成为默认路线，是因为它用链式法则 $p_\theta(x) = p_\theta(x^1)\prod_{i=2}^L p_\theta(x^i \mid x^{<i})$ 把联合分布拆成了逐词条件概率的乘积，从而可以直接计算精确交叉熵（[论文，§1 式 (2)](https://arxiv.org/pdf/2502.09992v3#page=1)）。

论文区分了两种讨论语境中的「ARM」：一种是指上述「下一词元预测」范式，另一种是指论文为了在同数据、同算力下做可控对比而从零训练的 1B 与 7B 自回归对照组（ARM Baseline）（[论文，§3.1、附录 B.2 表 5](https://arxiv.org/pdf/2502.09992v3#page=23)）。论文主张：可扩展性、上下文学习与指令遵循源于 Transformer 与式 (1) 诱导的 Fisher 一致性（在无限数据与足够容量下恢复真实分布的能力），而非式 (2) 单向分解的专利；相反，单向分解直接诱发了「记住 A 是 B 却推不出 B 是 A」的[反转诅咒（Reversal Curse）](https://arxiv.org/abs/2309.12288)（[论文，§1](https://arxiv.org/pdf/2502.09992v3#page=2)）。

::: details 点击展开：为什么最大似然等价于最小化 KL 散度与无损压缩
1. **展开式 (1) 右侧的前向 KL 散度**：
   $$
   \begin{aligned}
   \mathrm{KL}\big(p_{\mathrm{data}}(x) \,\|\, p_\theta(x)\big) &= \mathbb{E}_{p_{\mathrm{data}}(x)}\!\left[\log \frac{p_{\mathrm{data}}(x)}{p_\theta(x)}\right] &&\text{（KL 散度定义）} \\
   &= \mathbb{E}_{p_{\mathrm{data}}(x)}[\log p_{\mathrm{data}}(x)] - \mathbb{E}_{p_{\mathrm{data}}(x)}[\log p_\theta(x)] &&\text{（对数除法拆为减法）} \\
   &= -H(p_{\mathrm{data}}) - \mathbb{E}_{p_{\mathrm{data}}(x)}[\log p_\theta(x)] &&\text{（数据熵与 }\theta\text{ 无关）}
   \end{aligned}
   $$
2. **得出优化等价性**：数据信息熵 $H(p_{\mathrm{data}})$ 是常数，最小化前向 KL 散度与最大化期望对数似然拥有完全相同的最优参数 $\theta$；而 $-\mathbb{E}_{p_{\mathrm{data}}}[\log p_\theta(x)]$ 恰好对应交叉熵编码的平均码长（[论文，§1](https://arxiv.org/pdf/2502.09992v3#page=2)）。
:::

### 脱离自回归分解后，扩散语言模型必须跨越两个硬约束

**放弃从左到右链式分解之后，非自回归模型必须同时解决「如何定义并优化整句似然」与「离散词元如何支持多步双向改写」两个约束。**

在连续图像扩散模型中，直接对像素叠加高斯噪声即可表达任意程度的模糊状态；早期文本连续扩散路线（如将词元连续化后加噪）在扩展时算力效率很低，例如 1B 规模需要 ARM 约 64 倍的计算量才能达到相当效果（[论文，§4](https://arxiv.org/pdf/2502.09992v3#page=9)）。如果要走离散扩散路线并追平 ARM，设计必须同时跨过两道门槛（[论文，§2.1–2.4](https://arxiv.org/pdf/2502.09992v3#page=3)）：

1. **约束一（可算的整句似然代理）**：一旦不用链式乘积，模型只给出残缺序列下的局部填空分布，整句联合分布无法直接写出闭式乘积。训练目标必须在无需枚举指数级轨迹的前提下，与式 (1) 的最大似然建立严格数学联系。
2. **约束二（离散状态的迭代与缓存代价）**：离散词表索引没有「60% 的猫」这种中间模糊数值；一旦确定了具体词元，后续推理步骤如何继续修改错误预测？同时，取消因果掩码引入双向上下文后，ARM 依赖的键值缓存（KV Cache）和生成长度自然终止机制又该如何处置？

## 方法原理

### 前向随机掩码与时间反比加权构成负对数似然上界

**LLaDA 用离散掩码替换构建前向破坏过程，并通过在 $[0,1]$ 随机采样掩码率 $t$ 及 $1/t$ 加权的交叉熵损失，使训练目标成为模型负对数似然的严格上界。**

为接住第一个约束，LLaDA 采用[掩码扩散模型（Masked Diffusion Model, MDM）](https://arxiv.org/abs/2406.04329)框架（[论文，§2.1](https://arxiv.org/pdf/2502.09992v3#page=3)）。其前向过程在连续时间 $t \in [0, 1]$ 上逐位置独立运行：对干净序列 $x_0$ 的每个词元，以概率 $t$ 替换为词表中专门预留的**掩码词元（Mask Token, $\mathbf{M}$）**，以概率 $1-t$ 保持原词元不变。这一操作既不是把向量置零，也不是叠加高斯噪声，而是**离散占位符替换**：被掩码位置丢弃了词元内容身份，但通过旋转位置编码（RoPE）完整保留了位置编号；当 $t=1$ 时，整条序列全部变为 $\mathbf{M}$，形成一个确定无信息的 Dirac 起点分布（[论文，附录 A.1](https://arxiv.org/pdf/2502.09992v3#page=19)）。

训练阶段，LLaDA 用不带因果掩码的 Transformer 作为掩码预测器 $p_\theta(\cdot \mid x_t)$，一次性并行预测所有 $\mathbf{M}$ 位置上的原始词元，并仅在掩码位置计算带 $1/t$ 权重的交叉熵损失（[论文，§2.1 式 (3)–(4)](https://arxiv.org/pdf/2502.09992v3#page=3)）：

$$\mathcal{L}(\theta) \triangleq -\mathbb{E}_{t,\, x_0,\, x_t}\!\left[\frac{1}{t} \sum_{i=1}^{L} \mathbf{1}\big[x_t^i = \mathbf{M}\big] \log p_\theta\big(x_0^i \mid x_t\big)\right], \qquad -\mathbb{E}_{p_{\mathrm{data}}(x_0)}\big[\log p_\theta(x_0)\big] \le \mathcal{L}(\theta) \tag{2}$$

这一目标由两条机制共同支撑其理论与泛化特性：

1. **$t \sim U[0,1]$ 与 $1/t$ 权重缺一不可**：[论文直接引用 Shi 等人、Sahoo 等人与 Ou 等人的证明](https://arxiv.org/pdf/2502.09992v3#page=21)，指出式 (2) 是模型在 $t=0$ 处诱导分布负对数似然的上界。若改为 BERT 的固定 15% 掩码率，则无法覆盖从全空到近乎完整的全过程，只能做表示学习；若像 [MaskGIT](https://arxiv.org/abs/2202.04200) 那样删去 $1/t$，则退化为启发式目标，失去与最大似然的理论联系（[论文，§2.1](https://arxiv.org/pdf/2502.09992v3#page=4)）。
2. **与任意顺序自回归（AO-ARM）等价带来天然双向性**：期望意义上，式 (2) 等价于在所有 $L!$ 种排列顺序上均匀训练[任意顺序自回归模型（Any-Order Autoregressive Model, AO-ARM）](https://arxiv.org/abs/2202.02821)（[论文，附录 A.2 式 (15)](https://arxiv.org/pdf/2502.09992v3#page=22)）。<mark>模型在预训练阶段同时学到了从左到右、从右到左与任意跳空补全的条件分布，这正是它无需专门微调即可打破反转诅咒的根源</mark>（[论文，§3.1、§3.3](https://arxiv.org/pdf/2502.09992v3#page=6)）。
3. **训练与似然评估采用不同方差的等价写法**：SFT 阶段沿用同一结构，仅保持提示 $p_0$ 原样不变、对回复 $r_0$ 独立掩码，与预训练完全兼容（[论文，§2.3 式 (5)](https://arxiv.org/pdf/2502.09992v3#page=4)）。而在推理阶段评估条件似然时，若按概率 $t$ 独立掩码，短序列的掩码比例方差极大，需 1000 次以上蒙特卡洛采样才稳定；因此评估改用「无放回均匀抽取固定个数 $l \sim \{1,\dots,L\}$ 掩码、权重换为 $L/l$」的无偏等价形式，仅需 128 次采样即可稳定（单词元选择题仅需 1 次）（[论文，§2.4 式 (6)、附录 A.2、B.6](https://arxiv.org/pdf/2502.09992v3#page=21)）。

::: details 点击展开：为什么 1/t 权重补偿期望、NLL 上界成立与 AO-ARM 等价性
1. **$1/t$ 权重的期望补偿性质**（[论文，§2.1 式 (3)](https://arxiv.org/pdf/2502.09992v3#page=3)）：固定位置 $i$ 在比例 $t$ 下被替换为 $\mathbf{M}$ 的概率恰好为 $t$，因此对掩码抽样过程取期望：
   $$
   \begin{aligned}
   \mathbb{E}_{x_t \mid x_0, t}\!\left[\frac{1}{t}\,\mathbf{1}[x_t^i = \mathbf{M}]\right] &= \frac{1}{t} \cdot \mathbb{P}(x_t^i = \mathbf{M} \mid x_0, t) &&\text{（}t\text{ 相对条件期望为常数）} \\
   &= \frac{1}{t} \cdot t &&\text{（代入前向掩码概率 }t\text{）} \\
   &= 1 &&\text{（各掩码率贡献期望对齐）}
   \end{aligned}
   $$
   直觉上，$t$ 很小时句中仅缺少数词元、推理线索充分，样本出现概率低，乘以 $1/t$ 将这部分高质量监督拉回到与高掩码率同等的权重。
2. **负对数似然上界与 ELBO 的符号关系**：论文正文中并未展开式 (4) 的变分证明，而是直接引用 Shi 等人（2024）、Sahoo 等人（2024）与 Ou 等人（2024）的结论。设变分下界满足 $\log p_\theta(x_0) \ge \mathrm{ELBO}$，两边同乘 $-1$：
   $$
   \begin{aligned}
   -\log p_\theta(x_0) &\le -\mathrm{ELBO} &&\text{（不等式两边同乘 }-1\text{ 反向）} \\
   &= \mathcal{L}(\theta) &&\text{（线性掩码调度下展开化简）}
   \end{aligned}
   $$
   因此压低可计算的代理损失 $\mathcal{L}(\theta)$ 时，真实负对数似然的上界同步下移（[论文，§2.1、附录 A.1 式 (13)](https://arxiv.org/pdf/2502.09992v3#page=21)）。
3. **与任意顺序自回归目标（AO-ARM）的等价性**（[论文，附录 A.2 式 (15)](https://arxiv.org/pdf/2502.09992v3#page=22)）：AO-ARM 在全部排列 $\pi \sim U_\pi$ 上优化：
   $$-\mathbb{E}_{x_0,\, \pi \sim U_\pi}\!\left[\sum_{i=1}^{L} \log p_\theta\big(x_0^{\pi(i)} \mid x_0^{\pi(<i)};\, \pi\big)\right]$$
   将已知前缀 $x_0^{\pi(<i)}$ 视作「索引在 $\pi(\ge i)$ 处均被替换为 $\mathbf{M}$」的掩码序列 $x_t$，在全排列均匀分布下即等价于式 (2)。
:::

::: details 点击展开：算法 1–3（预训练、SFT 与低方差条件似然评估完整伪代码）
> **算法 1：LLaDA 预训练**（来源：[论文，附录 A.3 算法 1](https://arxiv.org/pdf/2502.09992v3#page=19)）
> - **输入**：掩码预测器 $p_\theta$，数据分布 $p_{\mathrm{data}}$
> - **输出**：收敛后的 $p_\theta$
>
> 1. **repeat**
> 2. &emsp;$x_0 \sim p_{\mathrm{data}}$（其中 $1\%$ 概率将序列长度 $L$ 设为 $U[1, 4096]$ 随机长度）
> 3. &emsp;$t \sim U(0, 1]$
> 4. &emsp;$x_t \sim q_{t|0}(x_t \mid x_0)$（逐位置独立以概率 $t$ 掩码为 $\mathbf{M}$）
> 5. &emsp;$\mathcal{L} = -\frac{1}{t \cdot L}\sum_{i=1}^{L}\mathbf{1}[x_t^i = \mathbf{M}]\log p_\theta(x_0^i \mid x_t)$
> 6. &emsp;计算 $\nabla_\theta \mathcal{L}$ 并执行优化器更新
> 7. **until** 收敛
> 8. **return** $p_\theta$

> **算法 2：LLaDA 监督微调（SFT）**（来源：[论文，附录 A.3 算法 2](https://arxiv.org/pdf/2502.09992v3#page=19)）
> - **输入**：掩码预测器 $p_\theta$，成对数据分布 $p_{\mathrm{data}}$
> - **输出**：微调后的 $p_\theta$
>
> 1. **repeat**
> 2. &emsp;$p_0, r_0 \sim p_{\mathrm{data}}$（短序列末尾补 `|EOS|` 对齐批内等长 $L'$）
> 3. &emsp;$t \sim U(0, 1]$
> 4. &emsp;$r_t \sim q_{t|0}(r_t \mid r_0)$（仅对回复 $r_0$ 掩码，提示 $p_0$ 保持不变）
> 5. &emsp;$\mathcal{L} = -\frac{1}{t \cdot L'}\sum_{i=1}^{L'}\mathbf{1}[r_t^i = \mathbf{M}]\log p_\theta(r_0^i \mid p_0, r_t)$
> 6. &emsp;计算 $\nabla_\theta \mathcal{L}$ 并执行优化器更新
> 7. **until** 收敛
> 8. **return** $p_\theta$

> **注意**：论文正文式 (3)/(5) 写为 $\frac{1}{t}\sum_i$，而附录算法 1/2 第 5 行写为 $\frac{1}{t \cdot L}\sum_i$，二者相差与序列长度相关的常数缩放因子，对固定长度 $L=4096$ 的优化方向一致。

> **算法 3：LLaDA 条件对数似然评估**（来源：[论文，附录 A.3 算法 3](https://arxiv.org/pdf/2502.09992v3#page=19)）
> - **输入**：掩码预测器 $p_\theta$，提示 $p_0$，回复 $r_0$，蒙特卡洛采样次数 $n_{mc}$
> - **输出**：条件对数似然估计值 $\text{log\_likelihood}$
>
> 1. 初始化 $\text{log\_likelihood} = 0$
> 2. **for** $k \leftarrow 1$ **to** $n_{mc}$ **do**
> 3. &emsp;$l \sim \{1, 2, \dots, L\}$（$L$ 为 $r_0$ 长度）
> 4. &emsp;从 $r_0$ 中无放回均匀随机抽取 $l$ 个词元掩码，得到 $r_l$
> 5. &emsp;$\text{log\_likelihood} = \text{log\_likelihood} + \frac{L}{l}\sum_{i=1}^{L}\mathbf{1}[r_l^i = \mathbf{M}]\log p_\theta(r_0^i \mid p_0, r_l)$
> 6. **end for**
> 7. $\text{log\_likelihood} = \text{log\_likelihood} / n_{mc}$
> 8. **return** $\text{log\_likelihood}$
:::

### 吸收态逆向核迫使每步重掩码，低置信度策略决定生成质量

**在吸收态掩码过程下，一旦某位置被填入非掩码词元就会在后续步骤中锁定不变，因此每步必须将 $s/t$ 比例的低置信度预测重新打回 $\mathbf{M}$，才能实现多步迭代纠错。**

![原文图 2：LLaDA 预训练、监督微调与逆向采样总览](/images/papers/llada/fig2-llada-overview.png)

*图 1：LLaDA 整体框架：(a) 预训练对所有词元独立以 $t \sim U(0,1)$ 掩码；(b) SFT 保持提示不变、仅掩码回复；(c) 逆向采样从全掩码 $t=1$ 走到 $t=0$，每步并行预测后执行重掩码。截取自[论文，§2、原文图 2](https://arxiv.org/pdf/2502.09992v3#page=3)。*

这一节接住第二个约束的前半部分：模型在训练时只学会了「看残缺句填空」，论文将模型分布 $p_\theta(x_0)$ 定义为从全掩码序列 $x_1$ 出发、沿逆向过程从 $t=1$ 迭代走到 $t=0$ 后所**诱导的边缘分布（Marginal Distribution）**——换言之，把中间所有草稿轨迹求和边缘化，最终交卷时的分布即为 $p_\theta(x_0)$（[论文，§2.1、附录 A.1](https://arxiv.org/pdf/2502.09992v3#page=20)）。

推理过程有两条关键不变量：

1. **时间无关参数化（Time-free Parameterization）**：在吸收态扩散下，数据预测函数 $q_{0|t}(x_s^i \mid x_t)$ 在数学上严格等于干净数据给定「当前所有未掩码词元集合 $x_t^{\mathrm{UM}}$」的条件分布 $p_{\mathrm{data}}(x_0^i \mid x_t^{\mathrm{UM}})$，与时间刻度 $t$ 无关（[论文，附录 A.1 式 (11)](https://arxiv.org/pdf/2502.09992v3#page=20)）。因此模型输入无需像连续图像扩散那样额外传入时间步嵌入 $t$。
2. **已填词元锁定与重掩码（Remasking）的必要性**：对于任意 $0 \le s < t \le 1$，逆向转移核规定当 $x_t^i \ne \mathbf{M}$ 时，下一刻以概率 $1$ 保持原词不变（[论文，附录 A.1 式 (10)](https://arxiv.org/pdf/2502.09992v3#page=20)）。如果第 1 步把全部空位填满后不撤回，推理就会一步直接结束且错误永久冻结。为此，采样从 $t$ 推进到 $s$ 时分三步走：先同步预测所有 $\mathbf{M}$ 位置；再保留置信度最高的 $\lfloor L(1-s)\rfloor$ 个已填或新预测词元；最后把其余比例为 $s/t$ 的低置信度预测**重掩码**回 $\mathbf{M}$，留待后续上下文更完整时重算（[论文，§2.4、附录 A.3 算法 5](https://arxiv.org/pdf/2502.09992v3#page=21)）。

<mark>将随机重掩码替换为低置信度重掩码，在生成长度与步数均为 256 的消融实验中把 LLaDA 8B Base 的 GSM8K 成绩从 21.3 直接推升至 70.0，BBH 从 32.1 升至 45.0</mark>（[论文，附录 B.4 表 9](https://arxiv.org/pdf/2502.09992v3#page=25)）。此外，训练后的 LLaDA 无需重新训练即可直接切换半自回归的**块扩散 LLaDA**（Block Diffusion LLaDA）或纯自回归采样，但纯扩散采样在多数基准上综合最优（[论文，§2.4、附录 B.4 表 7–8](https://arxiv.org/pdf/2502.09992v3#page=24)）。

::: details 点击展开：逆向转移核公式与算法 4–5（随机 / 低置信度重掩码完整伪代码）
1. **吸收态逆向转移核与时间无关性质**（[论文，附录 A.1 式 (9)–(11)](https://arxiv.org/pdf/2502.09992v3#page=20)）：对 $0 \le s < t \le 1$，逆向联合转移按词元完全因子化为 $q_{s|t}(x_s \mid x_t) = \prod_{i=1}^L q_{s|t}(x_s^i \mid x_t)$，单位置转移概率满足：
   $$
   q_{s|t}(x_s^i \mid x_t) =
   \begin{cases}
   1, & x_t^i \neq \mathbf{M},\; x_s^i = x_t^i, \\
   \dfrac{s}{t}, & (x_t^i, x_s^i) = (\mathbf{M}, \mathbf{M}), \\
   \dfrac{t-s}{t}\, q_{0|t}(x_s^i \mid x_t), & x_t^i = \mathbf{M},\; x_s^i \neq \mathbf{M}, \\
   0, & \text{其他情况}.
   \end{cases}
   $$
   当 $x_t^i \neq \mathbf{M}$ 时转移概率为 $1$，这从数学上锁定了「已解码词元不再被直接覆盖」，重掩码是延迟或修正难词决策的唯一通道。

> **算法 4：LLaDA 随机重掩码采样**（来源：[论文，附录 A.3 算法 4](https://arxiv.org/pdf/2502.09992v3#page=20)）
> - **输入**：掩码预测器 $p_\theta$，提示 $p_0$，回答长度 $L$，采样步数 $N$
> - **输出**：生成回复 $r_0$
>
> 1. 设 $r_1$ 为长度为 $L$ 的全掩码序列
> 2. **for** $t \leftarrow 1$ **down to** $\frac{1}{N}$ **step** $\frac{1}{N}$ **do**
> 3. &emsp;$s = t - \frac{1}{N}$
> 4. &emsp;$r_0 = \arg\max_{r_0} p_\theta(r_0 \mid p_0, r_t)$（在掩码位置采用贪心预测）
> 5. &emsp;**for** $i \leftarrow 1$ **to** $L$ **do**
> 6. &emsp;&emsp;**if** $r_t^i \neq \mathbf{M}$ **then** $r_0^i = r_t^i$
> 7. &emsp;&emsp;**else** 以概率 $\frac{s}{t}$ 将 $r_0^i$ 重新置为 $\mathbf{M}$
> 8. &emsp;**end for**
> 9. &emsp;$r_s = r_0$
> 10. **end for**
> 11. **return** $r_0$

> **算法 5：LLaDA 低置信度重掩码采样**（来源：[论文，附录 A.3 算法 5](https://arxiv.org/pdf/2502.09992v3#page=21)）
> - **输入**：掩码预测器 $p_\theta$，提示 $p_0$，回答长度 $L$，采样步数 $N$
> - **输出**：生成回复 $r_0$
>
> 1. 设 $r_1$ 为长度为 $L$ 的全掩码序列
> 2. **for** $t \leftarrow 1$ **down to** $\frac{1}{N}$ **step** $\frac{1}{N}$ **do**
> 3. &emsp;$s = t - \frac{1}{N}$
> 4. &emsp;**for** $i \leftarrow 1$ **to** $L$ **do**
> 5. &emsp;&emsp;**if** $r_t^i \neq \mathbf{M}$ **then** $r_0^i = r_t^i,\; c^i = 1$
> 6. &emsp;&emsp;**else** $r_0^i = \arg\max_{r_0^i} p_\theta(r_0^i \mid p_0, r_t)$，且置信度 $c^i = p_\theta(r_0^i \mid p_0, r_t)_{r_0^i}$
> 7. &emsp;**end for**
> 8. &emsp;计算 $s$ 时刻应保持未掩码的词元数 $n_{\mathrm{un}} = \lfloor L(1-s) \rfloor$
> 9. &emsp;**for** $i \leftarrow 1$ **to** $L$ **do**
> 10. &emsp;&emsp;**if** $c^i$ 属于 $\{c^i\}_{1}^{L}$ 中最低的 $L - n_{\mathrm{un}}$ 个置信度 **then** $r_0^i = \mathbf{M}$
> 11. &emsp;**end for**
> 12. &emsp;$r_s = r_0$
> 13. **end for**
> 14. **return** $r_0$

> **注**：原论文第 21 页算法 5 第 12 行注释明确定义 $n_{\mathrm{un}} = \lfloor L(1-s) \rfloor$ 为「$s$ 时刻未掩码词元数」，但第 14–15 行误写作对最低的 $n_{\mathrm{un}}$ 个位置重掩码（若按字面执行，在终步 $s=0$ 时 $n_{\mathrm{un}}=L$ 会把整句全部重掩码）。对照 §2.4「重掩码 $s/t$ 比例最低置信词元」与第 12 行定义，实际重掩码数量应为 $L - n_{\mathrm{un}}$。
:::

::: details 点击展开：手算算例（5 词元 4 步采样过程如何从全掩码收敛到完整句子）
以下为**构造算例**（非论文实验数据），用于演示算法 5 在回复长度 $L=5$、采样步数 $N=4$（步长 $1/N = 0.25$）下的逐轮状态流转。

![构造算例：低置信度重掩码 4 步采样流转示意图](/images/papers/llada/remasking-example.svg)

| 步数 | 时间转移 | 非掩码配额 $n_{\mathrm{un}} = \lfloor L(1-s) \rfloor$ | 重掩码个数 | 各位置状态 $r_s$（位置 1–5） |
|---|---|---:|---:|---|
| 起点 | $t=1$ | $0$ | — | $[\mathbf{M},\; \mathbf{M},\; \mathbf{M},\; \mathbf{M},\; \mathbf{M}]$ |
| 第 1 步 | $1 \to 3/4$ | $\lfloor 5 \times 0.25 \rfloor = 1$ | $4$ | $[\mathbf{M},\; \mathbf{M},\; \text{不},\; \mathbf{M},\; \mathbf{M}]$ <!-- derived --> |
| 第 2 步 | $3/4 \to 1/2$ | $\lfloor 5 \times 0.50 \rfloor = 2$ | $3$ | $[\text{空},\; \mathbf{M},\; \text{不},\; \mathbf{M},\; \mathbf{M}]$ <!-- derived --> |
| 第 3 步 | $1/2 \to 1/4$ | $\lfloor 5 \times 0.75 \rfloor = 3$ | $2$ | $[\text{空},\; \mathbf{M},\; \text{不},\; \mathbf{M},\; \text{人}]$ <!-- derived --> |
| 第 4 步 | $1/4 \to 0$ | $\lfloor 5 \times 1.00 \rfloor = 5$ | $0$ | $[\text{空},\; \text{山},\; \text{不},\; \text{见},\; \text{人}]$ <!-- derived --> |

逐轮计算动作如下（每步独立成行）：

1. **第 1 步（$t=1 \to s=3/4$）**：
   - 输入全掩码序列 $r_1 = [\mathbf{M}, \mathbf{M}, \mathbf{M}, \mathbf{M}, \mathbf{M}]$
   - 预测全部位置得候选 $[\text{空}(0.82),\; \text{山}(0.45),\; \text{不}(0.91),\; \text{见}(0.38),\; \text{人}(0.60)]$ <!-- derived -->
   - 计算未掩码配额 $n_{\mathrm{un}} = \lfloor 5 \times (1 - 3/4) \rfloor = 1$
   - 保留最高置信词「不」（$0.91$），其余 $4$ 个低置信位置重掩码回 $\mathbf{M}$ <!-- derived -->
   - 输出 $r_{3/4} = [\mathbf{M}, \mathbf{M}, \text{不}, \mathbf{M}, \mathbf{M}]$
2. **第 2 步（$t=3/4 \to s=1/2$）**：
   - 位置 3 已定，直接锁定 $r_0^3 = \text{不}$ 且置信度置为 $c^3 = 1$
   - 仅对剩余 $4$ 个 $\mathbf{M}$ 位置预测，得 $[\text{空}(0.88),\; \text{山}(0.64),\; \text{见}(0.55),\; \text{人}(0.79)]$ <!-- derived -->
   - 计算未掩码配额 $n_{\mathrm{un}} = \lfloor 5 \times (1 - 1/2) \rfloor = 2$
   - 保留「不」（$1.00$）与「空」（$0.88$），其余 $3$ 个位置重掩码 <!-- derived -->
   - 输出 $r_{1/2} = [\text{空}, \mathbf{M}, \text{不}, \mathbf{M}, \mathbf{M}]$
3. **第 3 步（$t=1/2 \to s=1/4$）**：
   - 位置 1 与位置 3 锁定为 $c^1 = c^3 = 1$
   - 预测剩余 $3$ 个位置得 $[\text{山}(0.74),\; \text{见}(0.68),\; \text{人}(0.92)]$ <!-- derived -->
   - 计算未掩码配额 $n_{\mathrm{un}} = \lfloor 5 \times (1 - 1/4) \rfloor = 3$
   - 保留「空」「不」「人」，将置信度最低的「山」「见」重掩码
   - 输出 $r_{1/4} = [\text{空}, \mathbf{M}, \text{不}, \mathbf{M}, \text{人}]$
4. **第 4 步（$t=1/4 \to s=0$）**：
   - 位置 1、3、5 锁定为 $c=1$
   - 在两侧已定词元双向上下文约束下，预测最后两处得 $[\text{山}(0.95),\; \text{见}(0.89)]$ <!-- derived -->
   - 计算未掩码配额 $n_{\mathrm{un}} = \lfloor 5 \times (1 - 0) \rfloor = 5$
   - 重掩码个数 $5 - 5 = 0$，不再撤回，输出完整序列 $r_0 = [\text{空}, \text{山}, \text{不}, \text{见}, \text{人}]$
:::

### 双向注意力令 KV 缓存失效，长度控制依赖固定画布与终止截断

**无因果掩码使 KV 缓存失去复用前提并改变 8B 注意力头配置，而变长输出则靠「预留固定长度画布 + 训练普通 `|EOS|` 词元并在采样后截断」来解决。**

这一节接住第二个约束的后半部分。在工程结构上，双向预测机制带来了两项与 ARM 截然不同的系统特征：

1. **KV 缓存失效与注意力配置改道**：ARM 推理能拆分「预填充（Prefill）」与「自回归解码（Decode）」，是因为因果掩码保证历史前缀词元的键/值（K/V）向量不受后续新词元影响。LLaDA 不使用因果掩码，每一步都必须把提示 $p_0$ 与当前回复 $r_t$ 拼接成完整序列过一遍网络；任意空位被改写，全局所有位置（包括提示部分）的表示都会变化，**导致 KV 缓存彻底失效**（[论文，§2.2、§5](https://arxiv.org/pdf/2502.09992v3#page=4)）。既然没有 KV 缓存可省，专门用于压缩 KV 缓存体积的**分组查询注意力**（Grouped Query Attention, GQA）便失去了存在意义。因此在 8B 规模上，论文放弃了 LLaMA3 8B 的 GQA（32 个查询头共享 8 个 KV 头），改用更简单的标准**多头注意力（Multi-Head Attention, MHA）**（32 个查询头配 32 个 KV 头），并把前馈网络（FFN）维度从 14,336 缩减至 12,288 以维持 8.02B 的可比总参数量（[论文，§2.2、附录 B.2 表 5](https://arxiv.org/pdf/2502.09992v3#page=23)）。相比之下，1B 对照实验为了严格对齐基线架构，仍保留了与 ARM 1B 相同的 4 个 KV 头（[论文，表 5](https://arxiv.org/pdf/2502.09992v3#page=23)）。
2. **固定画布长度控制与 `|EOS|` 抢跑修正**：ARM 在吐出终止符 `|EOS|` 时自动停机，而 LLaDA 在采样开始前必须由用户先指定回复画布长度 $L$。为此，预训练将 1% 的序列设为 $[1, 4096]$ 随机长度，SFT 则在每个小批次内用 `|EOS|` 填充短样本至等长，且把填充的 `|EOS|` 视作回复的一部分计入掩码损失；采样完成后直接丢弃 `|EOS|` 之后的所有词元（[论文，§2.2–2.4、附录 B.1](https://arxiv.org/pdf/2502.09992v3#page=22)）。<mark>SFT 数据中的大量 `|EOS|` 填充会导致纯扩散采样时 `|EOS|` 比例过高、输出过短；因此在 HumanEval、MBPP、GSM8K、Math 与 GPQA 评测中，论文在采样阶段强制将 `|EOS|` 的置信度置零，或改用遇到 `|EOS|` 即停的块扩散策略</mark>（[论文，§3.2、附录 B.4](https://arxiv.org/pdf/2502.09992v3#page=25)）。

::: details 点击展开：LLaDA 8B 与 LLaMA3 8B 参数抵消核算及表 5 架构全表
表 5 完整对比了自建 ARM 基线（1B / 7B）、LLaDA（1B / 8B）与 LLaMA3 8B 的超参数配置（[论文，附录 B.2 表 5](https://arxiv.org/pdf/2502.09992v3#page=23)）：

| 架构项 | ARM 基线 1B | LLaDA 1B | ARM 基线 7B | LLaDA 8B | LLaMA3 8B |
|---|---:|---:|---:|---:|---:|
| 层数（Layers） | 22 | 22 | 28 | 32 | 32 |
| 模型维度（$d_{\mathrm{model}}$） | 2048 | 2048 | 4096 | 4096 | 4096 |
| 查询头数（Q heads） | 32 | 32 | 32 | 32 | 32 |
| 词表大小 | 126,464 | 126,464 | 126,464 | 126,464 | 128,000 |
| FFN 维度 | 5634 | 5634 | 13,440 | 12,288 | 14,336 |
| 键/值头数（KV heads） | 4 | 4 | 8 | 32 | 8 |
| 总参数量 | 1.49B | 1.49B | 6.83B | 8.02B | 8.03B |
| 非嵌入参数量 | 0.97B | 0.97B | 5.80B | 6.98B | 6.98B |

以下依据表 5 数字（每头维度 $d_h = 4096 / 32 = 128$）核算 LLaDA 8B 与 LLaMA3 8B 单层参数量变化（注：此算式为根据表 5 数值进行的推导）：

1. **注意力层 K/V 投影多出的单层参数**：
   $$
   \begin{aligned}
   \Delta_{\mathrm{KV}} &= 2 \times d_{\mathrm{model}} \times (32 - 8) \times d_h &&\text{（K、V 两个矩阵各多 24 个头）} \\
   &= 2 \times 4096 \times 24 \times 128 &&\text{（代入表 5 维度）} \\
   &= 25,165,824 &&\text{（精确计算单层增量）} \\
   &\approx 25.17\text{M} &&\text{（单层约多 25.17M 参数）}
   \end{aligned}
   $$
2. **SwiGLU FFN 缩减抵消的单层参数**（含 gate、up、down 三个投影矩阵）：
   $$
   \begin{aligned}
   \Delta_{\mathrm{FFN}} &= 3 \times d_{\mathrm{model}} \times (14336 - 12288) &&\text{（SwiGLU 三矩阵减少维度）} \\
   &= 3 \times 4096 \times 2048 &&\text{（代入表 5 FFN 维度差）} \\
   &= 25,165,824 &&\text{（精确计算单层缩减量）} \\
   &\approx 25.17\text{M} &&\text{（精确抵消，非嵌入同为 6.98B）}
   \end{aligned}
   $$
:::

## 实验与证据

### 预训练算力扩展至 10^23 FLOPs，LLaDA 在数学与推理上展现更陡斜率

**在相同训练数据与最高接近 $10^{23}$ FLOPs 的计算预算下，LLaDA 展现出与自回归基线可比的整体扩展性，且在 MMLU 与 GSM8K 上扩展斜率更优。**

![原文图 3：LLaDA 与自建 ARM 基线在 6 项任务上的 FLOPs 扩展曲线](/images/papers/llada/fig3-scalability-flops.png)

*图 2：以 $6ND$ 计算的预训练 FLOPs 为横轴，比较同数据训练的 LLaDA 与 ARM 基线在 6 项任务上的表现。截取自[论文，§3.1、原文图 3](https://arxiv.org/pdf/2502.09992v3#page=6)。*

图 2 将此前仅验证到 $10^{18}\sim 10^{20}$ FLOPs 的扩展律研究推进至 $10^{20}\sim 10^{23}$ FLOPs 区间（[论文，§3.1](https://arxiv.org/pdf/2502.09992v3#page=6)）。具体数值上（[论文，附录表 18–19](https://arxiv.org/pdf/2502.09992v3#page=33)）：

- LLaDA 8B 在 $8.27 \times 10^{22}$ FLOPs（1975.52B 词元）时达到 MMLU 58.52、CMMLU 57.87，而在 $6.48 \times 10^{22}$ FLOPs 时 GSM8K 已达 53.30；作为对比，自建 ARM 7B 基线在 $7.71 \times 10^{22}$ FLOPs（2214.59B 词元）时分别为 MMLU 49.26、CMMLU 52.08 与 GSM8K 27.37。
- 在 PIQA 上 LLaDA 起步落后 ARM，但随着算力增加差距持续收窄（从早期落后约 8 个百分点收窄至末尾的 75.35 对 77.69）。

为排除 GSM8K 数据泄漏导致数学高分的质疑，论文在完全未见的规则合成数学数据集 iGSM 上测试了 4–6 步推理题（4-shot）：<mark>LLaDA 8B Base 分别取得 64.0 / 41.0 / 44.0，持续高于 LLaMA3 8B Base 的 38.0 / 35.0 / 34.0</mark>（[论文，§3.2、附录 B.8 表 12](https://arxiv.org/pdf/2502.09992v3#page=28)）。需要注明边界：受限于算力，论文在 1B 规模保证了与 ARM 完全一致的架构，而 8B LLaDA 对照的自建 ARM 基线为 7B（6.83B 总参数、不同批大小与学习率网格搜索），且超过 $10^{23}$ FLOPs 的同数据直接对比尚未开展（[论文，§3.1、§5、附录 B.2](https://arxiv.org/pdf/2502.09992v3#page=10)）。

### 8B 基座与 SFT 模型追平主流自回归基线，并在古诗反转补全中大幅反超

**2.3T 词元预训练后的 LLaDA 8B 在多项通用、数学与中文基准上追平甚至超出 LLaMA3 8B，仅经 SFT 即获得对话与指令遵循能力，且在反向诗句任务中彻底消除反转诅咒。**

![原文图 1：LLaDA 8B Base 与 Instruct 同 LLaMA3 8B、LLaMA2 7B 的基准雷达图对比](/images/papers/llada/fig1-zero-few-shot-benchmarks.png)

*图 3：左图为预训练基座模型在 9 项零/少样本基准上的对比，右图为后训练模型在 7 项基准上的对比。截取自[论文，§1、原文图 1](https://arxiv.org/pdf/2502.09992v3#page=2)。*

从表 1 与表 2 的代表性实测数字（统一评测协议下）可以看到扩散模型与成熟自回归模型的真实差距与优势所在（[论文，§3.2 表 1–2](https://arxiv.org/pdf/2502.09992v3#page=7)）：

| 模型与阶段 | 训练数据 | MMLU | GSM8K | Math | HumanEval | MBPP | CMMLU | ARC-C |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| LLaDA 8B Base（扩散） | 2.3T | **65.9** (5) | **70.3** (4) | **31.4** (4) | **35.4** (0) | 40.0 (4) | **69.9** (5) | 45.9 (0) |
| LLaMA3 8B Base（AR） | 15T | 65.4 (5) | 48.7 (4) | 16.0 (4) | 34.8 (0) | **48.8** (4) | 50.7 (5) | **53.1** (0) |
| LLaMA2 7B Base（AR） | 2T | 45.9 (5) | 13.1 (4) | 4.3 (4) | 12.8 (0) | 23.2 (4) | 32.5 (5) | 46.3 (0) |
| LLaDA 8B Instruct（仅 SFT） | 2.3T + 4.5M | 65.5 (5) | 69.4 (4) | **31.9** (0) | 49.4 (0) | 41.0 (4) | — | **88.5** (0) |
| LLaMA3 8B Instruct（SFT+RL） | 15T + RL | **68.4** (5) | **78.3** (4) | 29.6 (0) | **59.8** (0) | **57.6** (4) | — | 82.4 (0) |

上表改变了两项判断：

1. **预训练底座已跨过可用门槛，数据分布决定强弱项**：仅用 2.3T 词元预训练的 LLaDA 8B Base 在 MMLU（65.9 vs 65.4）、GSM8K（70.3 vs 48.7）、Math（31.4 vs 16.0）与 CMMLU（69.9 vs 50.7）上追平或领先 15T 词元的 LLaMA3 8B Base，但在 BBH（49.7 vs 62.1）、Hellaswag（70.5 vs 79.1）与 MBPP（40.0 vs 48.8）上落后；作者将其归因于各开源模型闭源预训练语料的质量与领域配比差异（[论文，§3.2](https://arxiv.org/pdf/2502.09992v3#page=7)）。
2. **SFT 即可驱动多轮对话，块扩散采样能进一步修复数学掉点**：LLaDA 8B Instruct 仅做了 4.5M 对 SFT 而未做任何 RL 对齐，因此在代码与 GSM8K 上落后经过 SFT+RL 的 LLaMA3 8B Instruct；但正如前文提到的 `|EOS|` 抢跑问题，若将 Instruct 的推理策略从纯扩散换成遇 `|EOS|` 即停的块扩散 LLaDA（块长 8），GSM8K 分数会从 69.4 回升至 78.6（块长 32 时为 77.5，Math 升至 42.2）（[论文，§3.2、附录 B.4 表 8](https://arxiv.org/pdf/2502.09992v3#page=25)）。

在专门检验双向泛化的 496 对中文古诗零样本补全任务中（[论文，§3.3 表 4](https://arxiv.org/pdf/2502.09992v3#page=9)）：GPT-4o（2024-08-06）正向达 82.7、反向骤降至 34.3；Qwen2.5-7B Instruct 正向 75.9、反向 38.0；而 LLaDA 8B Instruct 正向 51.8、反向 45.6。两款强自回归模型在「已知下一句猜上一句」上均出现大幅落差，LLaDA 则保持正反向接近并反超了二者。

### 少步数多词元解码带来吞吐优势，但步数等于长度时并行红利清零

**LLaDA 的推理速度完全取决于「单步并行解出多少个词元」：每步解 4–8 个词元时可在数学任务上反超带 KV 缓存的 LLaMA3，但当步数设为等于回答长度时，无缓存的全序列重算使其慢于自回归。**

![原文图 5：生成长度 256 下步数 32/64/128/256 的精度与吞吐量权衡曲线](/images/papers/llada/fig5-sampling-efficiency.png)

*图 4：在单卡 A100-80GB（batch size = 1, bfloat16）上，固定生成长度 256 并调节采样步数为 32、64、128、256（分别对应每次前向解出 8、4、2、1 个词元），对比 LLaDA 8B Base 与 LLaMA3 8B Base（有/无 KV 缓存）的吞吐量与得分。截取自[论文，附录 B.7、原文图 5](https://arxiv.org/pdf/2502.09992v3#page=26)。*

图 4 与表 11（[论文，附录 B.7](https://arxiv.org/pdf/2502.09992v3#page=27)）揭示了扩散解码真实的效率边界：

1. **并行红利仅存在于少步数区间**：ARM 每步只需计算 1 个新词元并复用提示与历史的 KV 缓存；LLaDA 每一步都要把「提示 $p_0$ + 全长画布 $L$」完整送入网络一次。当采样步数取 32 或 64（每次前向确认 8 或 4 个词元）时，LLaDA 在 GSM8K 和 Math 上（平均提示长度分别为 894 和 680 词元）以可比准确率取得了相对开启 KV 缓存的 LLaMA3 8B 高 **1.5 倍**和 **1.8 倍**的吞吐量。但在短提示任务 HumanEval（平均提示 132 词元）和 MBPP 上，相同吞吐下 LLaDA 持平或落后于 LLaMA3。而在表 2 的 Instruct 基准评测中，为了追求最高质量，论文将 GSM8K、Math、HumanEval、ARC-C 的采样步数设为等于答案长度 512（即每次前向只解 1 个词元），此时并行优势清零且每步都要重算全序列（[论文，附录 B.6](https://arxiv.org/pdf/2502.09992v3#page=27)）。
2. **显存占用恒定，略高于启用 KV 缓存的 LLaMA3**：在输入 1024、输出 2048 词元下，LLaDA 8B 显存占用为 19.02 GB（与采样步数无关），低于关闭 KV 缓存的 LLaMA3 8B（21.39 GB），但高于开启 KV 缓存的 LLaMA3 8B（16.74 GB）（[论文，附录 B.7 表 11](https://arxiv.org/pdf/2502.09992v3#page=27)）。
3. **长度超参数不敏感，CFG 稳定增益**：在生成长度 256 / 512 / 1024 消融中（步数等于长度），GSM8K 得分为 70.0 / 70.8 / 70.3，证明对长度超参数不敏感（[论文，附录 B.5 表 10](https://arxiv.org/pdf/2502.09992v3#page=25)）。此外，主实验为公平未开启**无分类器引导（Classifier-Free Guidance, CFG）**，但消融显示开启 CFG 后 ARC-C 从 45.9 升至 47.9、Hellaswag 从 70.5 升至 72.5（[论文，附录 B.3 表 6](https://arxiv.org/pdf/2502.09992v3#page=23)）。

::: details 点击展开：为什么「每步多词元」能摊薄提示成本，以及表 11 显存完整对比
1. **单次生成成本结构差异**（根据 [论文，§2.4、附录 B.7](https://arxiv.org/pdf/2502.09992v3#page=27) 的机制推算）：设提示长度为 $P$、回复长度为 $L$、采样步数为 $N$。
   - ARM 执行 $1$ 次覆盖 $P$ 词元的预填充，随后执行 $L$ 次仅处理 $1$ 个新词元的解码步（读取 KV 缓存）。
   - LLaDA 执行 $N$ 次覆盖完整 $P+L$ 长度的全序列前向计算，无缓存复用。
   - 当 $N \ll L$（如 $L=256, N=32$，每步确认 $8$ 个词元）且 $P$ 较大时，减少的迭代步数足以摊薄单步全序列重算
   - 当 $N = L$ 时，步数与 ARM 相同而单步计算量覆盖整段 $P+L$，不再具备速度优势。
2. **显存占用完整对比**（单位 GB，[论文，附录 B.7 表 11](https://arxiv.org/pdf/2502.09992v3#page=27)）：

| 输入长度 | 输出长度 | LLaDA 8B | LLaMA3 8B（无 KV 缓存） | LLaMA3 8B（有 KV 缓存） |
|---:|---:|---:|---:|---:|
| 512 | 512 | 17.03 | 16.70 | 16.32 |
| 512 | 1024 | 17.53 | 17.49 | 16.43 |
| 512 | 2048 | 18.52 | 20.00 | 16.73 |
| 1024 | 512 | 17.53 | 17.16 | 16.36 |
| 1024 | 1024 | 18.01 | 18.26 | 16.41 |
| 1024 | 2048 | 19.02 | 21.39 | 16.74 |
:::

## 局限性

1. **生成长度需预先指定且无法动态扩充**：采样前必须给定固定回复长度 $L$；虽然 256/512/1024 区间内准确率对长度不敏感，但长度设大浪费算力、设小会被硬截断，论文指出自适应生成长度才是更高效的方案（[论文，§5、附录 B.5](https://arxiv.org/pdf/2502.09992v3#page=10)）。
2. **同数据可控对比止步于 $10^{23}$ FLOPs，且模型与数据规模仍小于顶尖自回归对手**：受算力限制，8B 规模未能同步训练同等架构的 8B ARM 对照组，只能回退使用 7B ARM 基线；2.3T 预训练语料也少于 LLaMA3（15T）与 Qwen2.5（18T）（[论文，§3.1–3.2、§5](https://arxiv.org/pdf/2502.09992v3#page=10)）。
3. **缺少专用注意力优化与 KV 缓存等系统级推理加速**：LLaDA 直接沿用标准 RoPE 与 MHA，未引入块间缓存复用或更高效的采样调度算法；面对数千词元以上的长输出时，每步重算全序列的开销会随长度迅速放大（[论文，§5](https://arxiv.org/pdf/2502.09992v3#page=10)）。
4. **未经过强化学习（RL）对齐，且 SFT 的 `|EOS|` 填充会引发早停偏差**：后训练仅包含 4.5M 对 SFT，缺乏 DPO 或 RLHF 对齐，在代码生成（HumanEval、MBPP）与部分指令任务上仍弱于 LLaMA3 8B Instruct，且需要人工将 `|EOS|` 置信度置零来抑制早停（[论文，§3.2、§5、附录 B.4](https://arxiv.org/pdf/2502.09992v3#page=8)）。
5. **多模态、提示调优与智能体系统集成尚未验证**：论文明确将这些方向列为未探索领域，所有实验均局限在纯文本理解、数学、代码与对话基准（[论文，§5](https://arxiv.org/pdf/2502.09992v3#page=10)）。

## 结论

LLaDA 通过将掩码扩散模型从零扩展到 8B 参数与 2.3T 词元，把「大语言模型的缩放律、上下文学习、指令遵循能力」与「自回归从左到右分解」解绑：只要具备 $[0, 1]$ 随机掩码与 $1/t$ 加权所构成的负对数似然上界，无因果掩码的双向 Transformer 同样能够沿着算力扩展曲线收敛至主流开源基线水平，并凭借任意顺序等价性消除单向模型固有的反转诅咒（[论文，§3.1–3.3](https://arxiv.org/pdf/2502.09992v3#page=6)）。

在工程选型边界上，吸收态逆向核决定了低置信度重掩码是保障质量的必备步骤，而双向全局注意力决定了无缓存全序列前向的计算成本结构：当生成任务允许少步数多词元并行解码且对双向上下文或可编辑填空有明确需求时，掩码扩散方案具备实测吞吐与能力优势；若场景高度依赖超长输出或高步数精细解码，在引入缓存兼容架构与自适应长度机制之前，自回归模型仍是推理成本更低的选择（[论文，§5、附录 B.7](https://arxiv.org/pdf/2502.09992v3#page=27)）。

## 延伸阅读

- **原论文（arXiv:2502.09992v3）**：[Large Language Diffusion Models (Nie et al., 2025)](https://arxiv.org/abs/2502.09992v3)
- **官方项目主页与代码仓库**：[LLaDA Demo & Code](https://ml-gsai.github.io/LLaDA-demo/)
- **掩码扩散似然上界与时间无关重参数化理论来源**：[Simplified and Generalized Masked Diffusion for Discrete Data (Shi et al., 2024)](https://arxiv.org/abs/2406.04329)、[Simple and Effective Masked Diffusion Language Models (Sahoo et al., 2024)](https://arxiv.org/abs/2406.07524)、[Your Absorbing Discrete Diffusion Secretly Models the Conditional Distributions of Clean Data (Ou et al., 2024)](https://arxiv.org/abs/2406.03736)
- **前置离散扩散扩展律研究**：[Scaling Up Masked Diffusion Models on Text (Nie et al., 2024)](https://arxiv.org/abs/2410.18514)
- **低置信度重掩码与任意顺序自回归参考**：[MaskGIT: Masked Generative Image Transformer (Chang et al.)](https://arxiv.org/abs/2202.04200)、[Training and Inference on Any-Order Autoregressive Models the Right Way (Shih et al.)](https://arxiv.org/abs/2202.02821)
- **反转诅咒原论文**：[The Reversal Curse: LLMs trained on "A is B" fail to learn "B is A" (Berglund et al., 2023)](https://arxiv.org/abs/2309.12288)
