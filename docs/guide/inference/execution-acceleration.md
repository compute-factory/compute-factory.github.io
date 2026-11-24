---
title: 执行与解码加速
description: 在不改变模型权重与数值精度的前提下，拆解 Decode 阶段的算术强度与调度瓶颈，通过算子融合、CUDA Graphs 与投机解码降低生成延迟，并在实机验证并发拐点。
---

# 执行与解码加速

大型语言模型（Large Language Model, LLM）推理在追求低延迟时，除了通过量化压缩数值位数，还有一条不改变模型权重、不损失数值精度、且输出概率分布与原模型严格等价的优化路径：重构算子执行方式与解码调度流程。沿着这条路径定位单卡推理算力闲置的原因，是排查 CPU 调度空泡并决定何时启用投机解码的基础。下文理论推导部分统一采用 FP16 精度下 $4096 \times 4096$ 线性层与中间维度 $14336$ 的前馈层作为贯穿核算示例。

## Decode 阶段的瓶颈诊断

一次完整的自回归生成分为 **预填充（Prefill）**（并行处理全部输入提示词、写入键值缓存并输出第 1 个词元，决定首词元延迟 TTFT）与 **解码（Decode）**（每步仅将上一步刚产出的 1 个词元输入模型并生成下一个词元，决定单词元生成延迟 TPOT）。在实际部署中，Prefill 阶段往往能把 GPU 计算单元拉满，到了 Decode 阶段算力利用率却骤降至不足 1%。那么，Decode 阶段的瓶颈究竟卡在哪里？

### Prefill、Decode 的算术强度对比

**Decode 阶段算力闲置的首要原因在于每步只处理 1 个新词元，导致权重矩阵复用率为 1，算术强度远低于硬件脊点并长期受限于显存带宽。**

衡量算子受限于计算能力还是受限于显存搬运，体系结构中采用 **算术强度（Arithmetic Intensity, AI）** 与 [Roofline 模型](https://jax-ml.github.io/scaling-book/roofline/)。算术强度定义为算子每从片外主显存——即 **高带宽显存（High Bandwidth Memory, HBM）**（紧邻计算芯片封装的大容量堆叠主显存，访问延迟达数百时钟周期）——搬运 1 字节数据所完成的浮点运算次数（Floating Point Operations, FLOPs）：

$$
\text{AI} = \frac{\text{总浮点运算量（FLOPs）}}{\text{HBM 读写总字节数（Bytes）}} \tag{1}
$$

![LLM Decode 阶段的双侧瓶颈与三条加速路径](/images/inference/execution-acceleration/decode-bottlenecks.svg)

*图 1：Prefill 与 Decode 的算术强度与调度特征对照，以及 GPU 访存墙、CPU 发射墙分别对应的三类无损执行优化路径。*

对照图 1 上半部分，Prefill 阶段一次性并行处理 $B = \text{Batch} \times \text{SeqLen}$ 个 **词元（Token）**，核心计算是 **通用矩阵-矩阵乘法（General Matrix-Matrix Multiplication, GEMM）**；单并发 Decode 阶段（$B = 1$）每步只输入 1 个向量，线性层退化为 **通用矩阵-向量乘法（General Matrix-Vector Multiplication, GEMV）**，同时注意力层还需把历史所有词元的 **键值缓存（KV Cache）** 从显存读出做点积。

以通用数据中心 GPU（例如 H100 SXM5 FP16 峰值 $989\text{ TFLOPS}$、HBM3 带宽 $3.35\text{ TB/s}$）为计算参考，硬件 **脊点（Ridge Point）** 约为 $295.2\text{ FLOPs/Byte}$。代入一块 FP16 线性层权重 $W \in \mathbb{R}^{4096 \times 4096}$（约 $33.55\text{ MB}$）：

- **Prefill（$B = 1024$）**：权重被 $1024$ 个词元共同复用，算术强度约为 $341.3\text{ FLOPs/Byte}$，越过脊点进入 **计算受限（Compute-Bound）** 区。
- **单并发 Decode（$B = 1$）**：每搬运 $33.55\text{ MB}$ 权重只服务于 1 个向量乘加，算术强度跌至 <mark>$\approx 1.0\text{ FLOP/Byte}$</mark>，可达算力被带宽锁死在 $3.35\text{ TFLOPS}$，<mark>算力利用率不足 $0.35\%$</mark>。

::: details 点击展开：FP16 线性层 Prefill 与 Decode 算术强度分步核算
1. **符号与访存构成**：设权重矩阵形状为 $[D_{\text{in}}, D_{\text{out}}] = [4096, 4096]$，FP16 每元素占 $2\text{ Bytes}$，当前步输入总词元数为 $B$。总浮点运算量为 $2 \cdot B \cdot D_{\text{in}} \cdot D_{\text{out}}$，总访存包含权重读取 $2 D_{\text{in}} D_{\text{out}}$、输入激活读取 $2 B D_{\text{in}}$ 与输出写回 $2 B D_{\text{out}}$。
2. **Prefill 阶段（$B = 1024$）**：
   $$
   \begin{aligned}
   \text{AI}_{\text{Prefill}} &= \frac{2 \times 1024 \times 4096^2}{2 \times 4096^2 + 2 \times 1024 \times (4096 + 4096)} &&\text{（代入公式 1 与 FP16 字节数）} \\
   &= \frac{2048 \times 4096^2}{2 \times 4096^2 + 4 \times 4096^2} &&\text{（化简激活读写项）} \\
   &= \frac{2048}{6} &&\text{（约去公因子）} \\
   &\approx 341.3\text{ FLOPs/Byte} &&\text{（高于脊点 295.2，计算受限）}
   \end{aligned}
   $$
3. **Decode 阶段（$B = 1$）**：
   $$
   \begin{aligned}
   \text{AI}_{\text{Decode}} &= \frac{2 \times 1 \times 4096^2}{2 \times 4096^2 + 2 \times 1 \times (4096 + 4096)} &&\text{（单步仅输入 1 个向量）} \\
   &= \frac{4096}{4096 + 2} &&\text{（约去公因子 8192）} \\
   &\approx 0.9995\text{ FLOPs/Byte} &&\text{（远低于脊点，访存受限）}
   \end{aligned}
   $$
4. **可达算力对照**：在 $\text{AI} \approx 1.0$ 处，可达算力受 HBM3 带宽上限约束为 $3.35\text{ TB/s} \times 1.0 = 3.35\text{ TFLOPS}$，仅占峰值 $989\text{ TFLOPS}$ 的 $0.339\%$。
:::

![Roofline 视角下的 Prefill、Decode 与投机解码定位](/images/inference/execution-acceleration/roofline-decode.svg)

*图 2：Roofline 模型视角定位——左侧斜线为 HBM 带宽上限，右侧水平线为 Tensor Core 算力上限。*

对照图 2 中的三个定位点：常规 Decode（红色圆点 `(1)`）紧贴带宽斜线底部；投机解码（紫色圆点 `(2)`）沿斜线向右上方攀升；Prefill 与超大 Batch（蓝色圆点 `(3)`）则落入计算受限平台区。在实际使用 NVIDIA Nsight Compute 进行性能剖析时，工具会直接绘制出算子在这张图上的真实坐标：

![NVIDIA Nsight Compute 官方 Roofline 界面与指标构成](/images/inference/execution-acceleration/nvidia-ncu-roofline.png)

*图 3：NVIDIA Nsight Compute GPU Speed Of Light（SOL）Roofline 实测视图，横轴为算术强度（FLOP/byte），纵轴为浮点性能（FLOP/s），蓝色折线分别标示 Memory Bandwidth Boundary、Ridge Point 与 Peak Performance Boundary。来源：[NVIDIA Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/index.html)。*

### Kernel 启动开销

**当单个短算子在 GPU 上的执行耗时低于 CPU 下发驱动指令的耗时，串行发射就会在计算流上制造大量空闲气泡。**

在 PyTorch 默认的 **即时执行（Eager Mode）** 下，CPU 线程每执行到一行算子代码，都要完成形状校验、临时显存分配并通过 CUDA Runtime API 向 GPU 命令队列下发一个 **核函数（Kernel）**（在 GPU 上并行执行的函数实体）。从 CPU 调用发射接口到 GPU 调度器拉起计算的时间差称为 **核函数启动开销（Kernel Launch Overhead）**，纯驱动层耗时通常在 $3 \sim 10\text{ }\mu\text{s}$，叠加 Python 解释器调度后可达数十微秒。

在 Decode 阶段，每个解码层内含均方根归一化（RMSNorm）、残差相加（Residual Add）、旋转位置编码（RoPE）及激活函数等十余个独立算子。其中短算子在 GPU 上的实际计算耗时往往只有 $2 \sim 7\text{ }\mu\text{s}$，小于 CPU 发射间隔。数十层累加数百次发射后，<mark>CPU 调度延迟在端到端 TPOT 中的占比可达 $30\%$ 以上</mark>。

对照图 1 下半部分，后文依次拆解针对这两侧瓶颈的三项加速技术：**算子融合**减少 HBM 往返次数、**CUDA Graphs** 消除 CPU 逐个发射气泡、**投机解码**提高单步读取权重的产出词元数。

---

## 算子融合

面对 Decode 阶段逐元素算子与归一化算子频繁读写 HBM 的访存墙，最直接的工程思路是改变中间张量的存储生命周期，让它们尽量留在芯片内部而不落回外部主显存。

### 算子融合原理

**算子融合的物理收益来自 GPU 存储层级带宽差：片上寄存器与共享内存的访问带宽比片外 HBM 高出一个数量级以上。**

在 GPU 架构中，每个流式多处理器（Streaming Multiprocessor, SM）内部配备了线程私有的 **寄存器（Registers）** 与线程块内共享的 **片上共享内存（Shared Memory / SRAM）**（容量以百 KB 计，访问延迟极低，聚合片上带宽达数十 TB/s），而模型权重与中间激活张量默认存放在片外 HBM 中（带宽在数百 GB/s 到数 TB/s 量级）。

未融合模式下，每个算子各自对应一次独立 Kernel 启动，必须走完“HBM 读入 $\to$ 片上计算 $\to$ HBM 写回”完整路径。**算子融合（Operator Fusion）** 将逻辑相邻的多个算子合并编译为单个 Kernel，使前一步算出的中间张量直接驻留在寄存器或片上 SRAM 中传递给下一步计算，省去中间结果跨 HBM 总线写回再重读的流量，同时减少 Kernel 启动次数。

### 典型算子融合方式

根据所合并算子的计算特性，推理引擎中的算子融合主要分为以下两类典型方式：

#### Memory-Bound 融合

**把连续的访存密集型逐元素算子与归一化算子合入同一个 Kernel，可直接省去中间张量往返 HBM 的整倍流量。**

![算子融合对比：以 Residual Add + RMSNorm 为例](/images/inference/execution-acceleration/operator-fusion.svg)

*图 4：未融合模式（上方，2 次 Kernel 启动且中间结果 `sum_buf` 往返 HBM）与融合模式（下方，中间结果片上直传）数据路径对比。*

对照图 4 中的 `Residual Add + RMSNorm` 路径，设输入 `x` 与 `residual` 字节体积均为 $S$（向量权重 $\gamma$ 体积远小于激活张量，核算中忽略）：

1. **未融合路径（图 4 上半部分）**：Kernel 1 读取 `x` 与 `residual` 并写出 `sum_buf`，消耗 $3S$ 流量；Kernel 2 重读 `sum_buf` 并写出 `norm_out`，消耗 $2S$ 流量，合计搬运 $5S$ 字节并触发 $2$ 次启动。
2. **融合路径（图 4 下半部分）**：单个 `FusedAddRMSNorm` Kernel 从 HBM 读入 `x` 与 `residual` 后直接在寄存器内相加，不落回 HBM，紧接着在片上 SRAM 内完成平方和归约与缩放，仅写出最终 `norm_out` 与更新后的 `residual`，总流量降为 $4S$ 且合并为 $1$ 次启动。

对于不保留中间变量的 **SwiGLU 逐元素激活**（$\text{out} = \text{SiLU}(\text{gate}) \odot \text{up}$），省流比例更高：通过 **Triton**（开源 GPU 核函数 Python 领域特定语言）将其融合为单个核函数后只需读 `gate`、读 `up`、写 `out`，<mark>HBM 总流量从 $5S$ 降至 $3S$（减少 $40\%$）</mark>。

::: details 点击展开：Triton 融合 SwiGLU 核函数源码与带宽测试对比
以下代码展示用 Triton 编写单 Kernel 融合 `SiLU + 逐元素乘` 的核心写法：

```python
import triton
import triton.language as tl

@triton.jit
def fused_silu_mul_kernel(gate_ptr, up_ptr, out_ptr, n_elements, BLOCK_SIZE: tl.constexpr):
    pid = tl.program_id(axis=0)
    offsets = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = offsets < n_elements
    # 1. 从 HBM 一次性读入两个输入切片至寄存器，内部转 FP32 保证 Sigmoid 精度
    gate = tl.load(gate_ptr + offsets, mask=mask, other=0.0).to(tl.float32)
    up = tl.load(up_ptr + offsets, mask=mask, other=0.0).to(tl.float32)
    # 2. 中间乘积完全留在寄存器内，不回写 HBM
    out = (gate * tl.sigmoid(gate)) * up
    # 3. 仅写回最终输出张量
    tl.store(out_ptr + offsets, out.to(tl.float16), mask=mask)
```

以下实测输出采集自一块 **NVIDIA GeForce RTX 5070（48 SM，实测 HBM 拷贝带宽 576.7 GB/s，PyTorch `2.14.0+cu130`，Triton `3.8.0`）**，测试中间维度 `H_ffn = 14336` 的 FP16 SwiGLU（`warmup=30, iters=200`）：

```text
Empirical HBM copy bandwidth: 576.7 GB/s (0.465 ms for 256 MB traffic)
B=  1, H_ffn=14336: Unfused=   6.56 us | Fused=   6.86 us | Speedup=0.96x | max_diff=3.91e-03
B= 32, H_ffn=14336: Unfused=   6.76 us | Fused=   6.89 us | Speedup=0.98x | max_diff=7.81e-03
B=128, H_ffn=14336: Unfused=   7.19 us | Fused=   6.86 us | Speedup=1.05x | max_diff=7.81e-03
B=512, H_ffn=14336: Unfused=  64.02 us | Fused=  10.79 us | Speedup=5.93x | max_diff=7.81e-03
```

**结果解读与分析**：
1. **小张量阶段（$B \le 128$）受限于 Kernel 启动开销**：`B=1` 时张量仅 $28\text{ KB}$，纯显存读写耗时不足 $0.2\text{ }\mu\text{s}$，两组耗时均停留在 $6.6 \sim 7.2\text{ }\mu\text{s}$ 启动延迟平台，说明小张量必须配合 CUDA Graphs 消除启动开销。
2. **大张量带宽敏感区（$B = 512$）融合加速达 $5.93\times$**：此时单张量达 $14.7\text{ MB}$，超出 L2 缓存局部驻留范围，未融合模式触发中间缓冲分配与多次 HBM 往返使耗时跳升至 $64.02\text{ }\mu\text{s}$，而融合核函数压至 $10.79\text{ }\mu\text{s}$。
3. **数值误差受控**：`max_diff` 处于 FP16 正常舍入误差范围（$\le 7.81 \times 10^{-3}$）。
:::

#### Epilogue 融合

**把偏置相加、激活函数或输出量化直接合入矩阵乘核函数的收尾阶段，可以消除矩阵乘之后的一次全张量访存。**

在传统计算图中，大型矩阵乘法（GEMM / GEMV）先把累加结果从寄存器写回 HBM，紧接着再启动一个逐元素 Kernel 读回该矩阵加偏置（Bias Add）、过激活函数或转换为低精度格式（如 FP8）。**尾声融合（Epilogue Fusion）** 在矩阵乘累加寄存器结果即将写回 HBM 之前，直接在寄存器里顺手完成上述后处理，然后一次性写出最终结果。

同一思路在注意力算子上体现为 **FlashAttention 分块融合**：通过 SRAM 分块（Tiling）与在线 Softmax（Online Softmax），将注意力分数矩阵 $QK^T$ 全程锁在片上 SRAM 中完成归一化并与 $V$ 相乘，避免 $O(N^2)$ 规模的中间分数矩阵落入 HBM。

### 算子融合的寄存器压力与 SM 占用率边界

**算子融合受制于单个 SM 的固定寄存器总量，过度合并复杂算子会拉低占用率并触发寄存器溢出。**

GPU 每个 SM 的寄存器文件容量固定（例如每 SM 65536 个 32 位寄存器）。单个融合 Kernel 内并入的计算步骤越多，编译器为每个线程同时分配的存活寄存器就越多。当每线程寄存器数量突破阈值时，SM 上可同时驻留的活跃线程束比例——即 **占用率（Occupancy）**——被迫下降，削弱隐藏显存延迟的能力；极端情况下多余变量会溢出到位于 HBM 的本地内存中（Register Spilling），使融合收益彻底逆转。此外，当相邻算子需要切换并行归约轴时，也必须在同步边界切开，交由 `torch.compile` / TorchInductor 等编译器自动搜索最优子图边界。

---

## CUDA Graphs

算子融合降低了单步 HBM 读写量，但模型各层之间仍存在数十个无法合为一体的线性投影、注意力与集合通信 Kernel。如果继续由 CPU 在运行时逐一提交它们，GPU 计算流上依然会留出大量发射气泡。如何一次性把整串 Kernel 发射任务从 CPU 侧剥离出来？

### CUDA Graphs 简介

**CUDA Graphs 是一种将多步 GPU 操作及其依赖关系预先固化为静态图并在运行时单次提交重放的执行抽象。**

在常规 Eager 模式下，哪怕每一轮 Decode 的网络结构完全一致，CPU 也必须重复做一遍 Python 逻辑解析、算子调度与 CUDA API 发射。自 CUDA 10 引入的 [CUDA Graphs](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/cuda-graphs.html) 改变了这一流程：它将原本分散在每次推理步中的 CPU 驱动工作全部前移至服务启动或预热阶段，运行时只需向 GPU 命令队列发出一张完整执行图的句柄，由 GPU 硬件调度器接管图内全部 Kernel 的连续拉起。

### Graph Capture 与 Graph Replay 机制

**CUDA Graphs 通过“图捕获记录指针拓扑 + 图重放原地更新数据”两阶段机制，将上百次 CPU 发射开销压成单次调用。**

![CUDA Graphs 原理与分段图（Piecewise）机制](/images/inference/execution-acceleration/cuda-graphs-timeline.svg)

*图 5：Eager 逐个下发产生 GPU 空闲气泡（左上）、CUDA Graph 单次提交连续执行（右上），以及面对动态 Attention 的 Piecewise 分段图结构（下方）。*

对照图 5 顶部的 `1. Eager 模式` 与 `2. CUDA Graph Replay` 对比，CUDA Graphs 的运行闭环分为两个阶段：

1. **图捕获（Graph Capture）**：引擎将 CUDA 流切换为捕获状态并执行一次前向传播。此过程 GPU 不做真实计算，驱动仅记录所经过的全部 Kernel、依赖拓扑、网格维度以及每个输入输出张量绑定的**固定显存虚拟地址**，编译实例化为可执行图对象。
2. **图重放（Graph Replay）**：进入正式推理后，CPU 仅把新一轮输入数据原地拷贝（In-place Copy）至 Capture 阶段绑定的固定输入缓冲区，随后调用一次 `cudaGraphLaunch`（PyTorch 中对应 `graph.replay()`）。图 5 右上方的 `K1` 至 `K3` 随即在 GPU 内背靠背连续执行，CPU 发射任务瞬间完成并可立即处理下一轮调度。

下面的 NVIDIA 官方 Nsight Systems 实测截图，直观展示了短算子序列在启用 CUDA Graphs 前后 GPU 时间线上的真实差异：

![NVIDIA 官方 Nsight Systems 传统流逐个发射 shortKernel 时间线](/images/inference/execution-acceleration/nvidia-cudagraph-before.png)

*图 6：未使用 CUDA Graphs 时，CPU 端每次调用需经过 `cudaStream...` 发射流程，导致 GPU 行上相邻 `shortKernel` 之间出现大量白色空闲间隙。来源：[NVIDIA Technical Blog — Getting Started with CUDA Graphs](https://developer.nvidia.com/blog/cuda-graphs/)。*

![NVIDIA 官方 Nsight Systems 启用 CUDA Graphs 后 shortKernel 紧凑执行时间线](/images/inference/execution-acceleration/nvidia-cudagraph-after.png)

*图 7：启用 CUDA Graphs 后，多个 `shortKernel` 由硬件在图内部紧凑连续拉起，相邻内核间的发射空泡被大幅消除。来源：[NVIDIA Technical Blog — Getting Started with CUDA Graphs](https://developer.nvidia.com/blog/cuda-graphs/)。*

::: details 点击展开：PyTorch CUDA Graph 静态缓冲录制与重放最小模板
```python
import torch

# 1. 预分配固定显存地址的静态输入与输出缓冲（Capture 后指针地址不可改变）
static_x = torch.empty((1, 4096), dtype=torch.float16, device="cuda")
static_y = torch.empty_like(static_x)

# 2. Warmup：在私有流上预热，确保 cuBLAS 句柄、显存池与 JIT 核函数在 Capture 前就绪
s = torch.cuda.Stream()
s.wait_stream(torch.cuda.current_stream())
with torch.cuda.stream(s):
    for _ in range(3):
        static_y.copy_(decode_step(static_x))
torch.cuda.current_stream().wait_stream(s)

# 3. Graph Capture：录制静态拓扑与固定缓冲地址
g = torch.cuda.CUDAGraph()
with torch.cuda.graph(g):
    static_y.copy_(decode_step(static_x))

# 4. Graph Replay：推理循环仅做原地拷贝与单次图重放
for incoming_token_hidden in decode_steps:
    static_x.copy_(incoming_token_hidden)  # 必须使用 copy_ 原地覆写，不能重新赋值张量
    g.replay()
```
:::

### 推理引擎中的 CUDA Graph 应用

直接把一整张静态图套用在真实 LLM 服务中，会立刻遭遇**动态 Batch Size** 与 **动态序列长度** 两大障碍——图捕获要求指针地址、张量形状与控制流在录制后完全静态。现代推理引擎（如 vLLM、SGLang）采用以下两项组合机制打通工程落地：

#### 分桶与填充

**预先只对离散的 Batch 档位录制有限张静态图，运行时把实时并发请求向上对齐补齐至最近档位重放。**

连续批处理（Continuous Batching）下每一步活跃并发数都在变动，为所有可能的整数并发度各录一张图会耗尽静态缓冲显存。引擎在初始化时只针对一组离散档位（例如 `[1, 2, 4, 8, 16, 24, 32, ...]`）录制静态图。当某步实际到达 $11$ 条请求时，调度器将输入张量向上填充（Pad）至 $16$ 行后重放 $B=16$ 对应的图，并在注意力掩码层面隔离空填充行，避免污染真实请求的 KV Cache。

#### 元数据静态化与分段图捕获

**通过固定指针传递可变长度数组或在 Attention 边界拆分为分段图，使 CUDA Graphs 兼容动态序列长度与混合批处理。**

每条请求的历史长度 `seq_lens` 与 KV Cache 块索引 `block_tables` 每步都在变化。主流引擎采取两条互补路线应对：

- **元数据静态化（Full CUDA Graph）**：把 `seq_lens`、`block_tables`、`slot_mapping` 预先放进固定显存地址的张量缓冲中，重放前仅原地覆写其中的整数值，支持全图捕获的注意力内核直接按静态指针读出最新长度，从而将整模型前向收入单张大图。
- **分段图捕获（Piecewise CUDA Graph）**：当服务开启分块预填充（Chunked Prefill）混跑或使用暂不支持全图捕获的注意力后端时，编译器对照图 5 第 3 段在 Attention 边界将计算图切开——Attention 前后的 `RMSNorm + QKV + RoPE` 与 `O投影 + MLP` 被分别捕获进静态图片段，仅让动态 Attention 保持 Eager 执行。

---

## 投机解码

算子融合压缩了 HBM 往返流量，CUDA Graphs 消除了 CPU 发射气泡，但两者都不改变自回归解码的结构约束：每搬运一次全部模型权重，依然只产出一个词元。既然小并发下计算单元大部分时间在等待数据搬运，能否在读取一次权重的同时，并行算出并确认多个词元？

### 投机解码原理介绍

**投机解码通过“轻量草稿猜想多步 + 目标模型单步并行验证 + 逐位拒绝采样”，在不改变目标模型输出分布的前提下把单步串行依赖转化为并行计算。**

回到图 2 的 Roofline 模型：小并发 Decode 位于远低于脊点的带宽受限区。若通过 **因果掩码（Causal Mask）**（屏蔽后续位置对前面位置的注意力可见性）构造长度为 $\gamma + 1$ 的并行输入喂入 **目标模型（Target Model）**，目标模型只需从 HBM 读取**一次权重**即可同时输出全部 $\gamma + 1$ 个位置的精确分布，耗时几乎与单步生成 1 个词元相同。

![投机解码：草稿生成、并行验证与拒绝采样](/images/inference/execution-acceleration/speculative-decoding.svg)

*图 8：投机解码单轮执行三阶段——草稿生成（左）、目标模型单步并行验证（中）与逐位拒绝采样裁决（右）。*

对照图 8 从左到右三个阶段，[投机解码（Speculative Decoding）](https://arxiv.org/abs/2211.17192) 每轮按以下流程推进：

1. **草稿生成（Drafting）**：由计算开销极低的 **草稿模型（Draft Model）** 或轻量预测机制从已知前缀出发，连续猜想 $\gamma$ 个候选词元 $x_1, \dots, x_\gamma$ 及草稿概率分布 $q_1, \dots, q_\gamma$。
2. **并行验证（Parallel Verification）**：将前缀末尾词 $t_n$ 与 $\gamma$ 个候选拼接成长度为 $\gamma + 1$ 的输入序列送入目标模型，单次前向并行给出精确分布 $p_1, \dots, p_{\gamma+1}$。
3. **逐位拒绝采样（Rejection Sampling）**：依次检验位置 $i = 1 \dots \gamma$，以概率 $\min\bigl(1, \frac{p_i(x_i)}{q_i(x_i)}\bigr)$ 接受 $x_i$。一旦某个位置 $i$ 被拒绝（如图 8 右侧 `x3 拒绝`），作废其后所有候选，并从归一化残差分布 $\text{norm}(\max(0, p_i - q_i))$ 重采样修正词 $x'_i$；若全部 $\gamma$ 个候选均被接受，则顺带采样第 $\gamma + 1$ 个分布 $p_{\gamma+1}$ 作为额外奖励词元（Bonus Token）。

<mark>每轮至少保证产出 1 个目标分布词元，最多可推进 $\gamma + 1$ 个词元</mark>，且输出分布与单独运行目标模型在数学上严格一致。

::: details 点击展开：算法 1（投机解码伪代码）与拒绝采样分布等价性证明
> **算法 1：单轮投机解码（Speculative Sampling）**（来源：[Leviathan et al., 2023](https://arxiv.org/abs/2211.17192)）
> - **输入**：已有前缀 $T = [t_1, \dots, t_n]$，目标模型 $M_p$，草稿机制 $M_q$，草稿步长 $\gamma$
> - **输出**：追加确认的 $1 \sim \gamma + 1$ 个词元序列
>
> 1. **for** $i = 1$ **to** $\gamma$ **do**
> 2. &emsp;计算草稿概率分布 $q_i \leftarrow M_q(T + [x_1, \dots, x_{i-1}])$
> 3. &emsp;从草稿分布采样 $x_i \sim q_i$
> 4. **end for**
> 5. 并行调用目标模型计算全部位置分布 $(p_1, \dots, p_{\gamma+1}) \leftarrow M_p(T + [x_1, \dots, x_\gamma])$
> 6. 初始化接受前缀计数 $k \leftarrow 0$
> 7. **for** $i = 1$ **to** $\gamma$ **do**
> 8. &emsp;采样均匀随机数 $r \sim U(0, 1)$
> 9. &emsp;**if** $r \le \frac{p_i(x_i)}{q_i(x_i)}$ **then**
> 10. &emsp;&emsp;接受 $x_i$ 并更新 $k \leftarrow k + 1$
> 11. &emsp;**else**
> 12. &emsp;&emsp;从残差分布 $p'_i(x) \propto \max(0, p_i(x) - q_i(x))$ 重采样修正词 $x'_i$ 并跳出循环
> 13. &emsp;**end if**
> 14. **end for**
> 15. **if** $k = \gamma$ **then** 从 $p_{\gamma+1}$ 采样额外词元 $x'_{\gamma+1}$，**return** $[x_1, \dots, x_\gamma, x'_{\gamma+1}]$
> 16. **else** **return** $[x_1, \dots, x_k, x'_{k+1}]$

**分布等价性分步证明**（任意单位置任意词元 $x$）：
$$
\begin{aligned}
P(\text{直接接受 } x) &= q(x) \cdot \min\left(1, \frac{p(x)}{q(x)}\right) &&\text{（草稿抽中且通过校验）} \\
&= \min\bigl(q(x), p(x)\bigr) &&\text{（消去正概率分母）} \\
\beta &= 1 - \sum_y \min\bigl(q(y), p(y)\bigr) &&\text{（全部词拒绝概率之和）} \\
&= \sum_y \max\bigl(0, p(y) - q(y)\bigr) &&\text{（利用恒等式拆分）} \\
P(\text{输出 } x) &= \min\bigl(q(x), p(x)\bigr) + \beta \cdot \frac{\max\bigl(0, p(x) - q(x)\bigr)}{\beta} &&\text{（两条互斥路径相加）} \\
&= \min\bigl(q(x), p(x)\bigr) + \max\bigl(0, p(x) - q(x)\bigr) &&\text{（约去拒绝归一化因子）} \\
&= p(x) &&\text{（严格还原目标分布）}
\end{aligned}
$$
:::

### 典型投机解码技术

早期投机解码依赖单独部署一个更小的同家族独立模型作为草稿模型，但在多卡并行部署中需要额外管理两套权重与两份 KV Cache，且小模型与目标大模型分布存在落差。为简化部署并提高接收率，社区演化出无需独立大草稿模型的轻量挂载架构（以及基于提示词检索的 N-gram 查表方法）：

#### Medusa

**Medusa 在目标模型冻结主干的顶层特征上挂载多个并行的线性解码头，单次前向同时预测未来多个位置的候选词元并构造候选树并行验证。**

[Medusa](https://arxiv.org/abs/2401.10774) 完全省去独立草稿模型：在主干最后一层隐藏状态之后新增 $\gamma$ 个轻量预测头，分别并行输出第 $t+1, t+2, \dots, t+\gamma$ 步的词表分布，再将各步的高概率候选组合为一棵多分支候选树（Token Tree），通过定制的树形注意力掩码（Tree Attention）交由目标模型单步验证。

Medusa-1 保持原模型主干权重冻结、仅微调预测头，可保证输出质量无损；Medusa-2 将主干与预测头联合微调以获得更高加速比。其主要结构局限在于**各预测头之间互相独立预测，缺乏相邻步之间的条件自回归依赖**，导致步长增大时后继预测头的准确率下降较快。

#### EAGLE-3

**EAGLE-3 放弃早期的特征预测限制，改为直接自回归预测词元，并通过多层特征融合（Training-Time Test）让草稿头能随训练数据规模扩展持续提高接收率。**

早期的 EAGLE 系列尝试在目标模型顶层隐特征空间做自回归外推，但存在特征误差累积与训练数据扩增收益见顶的问题。[EAGLE-3](https://arxiv.org/abs/2503.01840) 做出了两项关键架构变革：

1. **直接预测词元**：移除特征层回归约束，让单层轻量自回归草稿头直接基于上下文条件预测下一词元，彻底消除单步特征外推误差的层层放大，重新打通草稿头随训练数据增长的 Scaling 收益。
2. **多层特征融合（Training-Time Test）**：不再只读取目标模型的最后一层特征，而是融合目标模型浅、中、深多层隐藏特征作为草稿头的条件输入，在推理时以极低单步耗时恢复主干语义上下文并配合动态候选树验证。

### 投机解码的收益边界

**投机解码仅在访存受限且接收率足够高时有效；当高并发把计算推入 Compute-Bound 平台区，额外验证矩阵计算会直接导致总吞吐下降。**

设平均 **接收率（Acceptance Rate）** 为 $\alpha \in (0, 1)$，单步草稿相对耗时为 $c = T_{\text{draft}}(1) / T_{\text{target}}(1)$，目标模型并行验证 $\gamma + 1$ 个位置的耗时膨胀系数为 $r_{\text{verify}}(\gamma) = T_{\text{target}}(\gamma + 1) / T_{\text{target}}(1)$，则理论期望加速比为：

$$
\text{Speedup} = \frac{1 - \alpha^{\gamma + 1}}{(1 - \alpha)\bigl(c \cdot \gamma + r_{\text{verify}}(\gamma)\bigr)} \tag{2}
$$

由公式 (2) 可直接判断两条硬边界：

- **任务可预测性与草稿开销（$\alpha$ 与 $c$）**：在代码补全、结构化改写等高确定性任务中（$\alpha \approx 0.8$），单轮期望产出可达 $3 \sim 4$ 个词元；若生成高度发散（$\alpha < 0.4$）或草稿本身耗时过高（$c$ 偏大），分母膨胀会抵消分子收益。
- **并发 Batch Size 拐点（$r_{\text{verify}}(\gamma)$）**：单请求（$B=1$）下验证 $\gamma+1$ 个位置几乎不增加权重读取耗时，$r_{\text{verify}}(\gamma) \approx 1.0$；当线上服务并发拉高至大 Batch 时，验证矩阵行数被放大 $(\gamma + 1)$ 倍，算术强度跨过图 2 脊点进入算力平台区，此时 <mark>$r_{\text{verify}}(\gamma)$ 随 $(\gamma+1)$ 线性攀升</mark>，使整体吞吐出现净倒退。

---

## 入门动手实战

下面从零搭建推理环境并编写单文件对照脚本，在通用 NVIDIA GPU 上独立复现“无加速 Eager 基线 $\to$ 算子融合 + CUDA Graphs $\to$ 叠加投机解码”的延迟变化，并实测高并发下的吞吐拐点。

### 环境搭建

**仅假定本机具备基础 CUDA 驱动与 Python 3.10+ 环境，必须先创建独立虚拟环境并显式安装推理框架 vLLM 与底层编译构建工具。**

**第一步：创建实验目录与隔离虚拟环境**

```bash
mkdir -p ~/compute_factory_lab/execution-acceleration
cd ~/compute_factory_lab/execution-acceleration
python3 -m venv .venv
source .venv/bin/activate
```

- **路径说明**：`~/compute_factory_lab/execution-acceleration` 为示例工作目录，可替换为任意本机可写路径。
- **隔离作用**：使用 `venv` 避免与系统已有 PyTorch 环境冲突，激活后命令行前缀出现 `(.venv)`。

**第二步：安装 vLLM 与 JIT 编译依赖**

```bash
pip install -U pip
pip install -U vllm ninja
```

- **核心组件**：安装 `vllm` 会自动拉取匹配版本的 `torch` 与 `triton`；显式安装 `ninja` 构建工具是因为 `torch.compile` 与 FlashInfer 在首次执行时会即时编译部分辅助核函数，缺少 `ninja` 会在引擎初始化时直接报错退出。
- **CUDA 路径检查**：若系统存在多版本 CUDA Toolkit，需确认 `nvcc` 所在目录（如 `/usr/local/cuda/bin`）已在 `PATH` 中，并将 `.venv/bin` 保持在 `PATH` 搜索队列前位。

**第三步：准备测试模型权重（离线下载可选）**

```bash
pip install -U huggingface_hub
huggingface-cli download Qwen/Qwen3-0.6B --local-dir /path/to/models/Qwen3-0.6B
```

- **草拟路径替换提醒**：`/path/to/models/Qwen3-0.6B` 为草拟占位路径，执行前需修改为你本机实际存放权重的路径（例如 `~/models/Qwen3-0.6B`）。
- **在线拉取替代方式**：若运行环境可直接访问 Hugging Face，也可跳过此步，在下方脚本中直接把 `MODEL_PATH` 设为 `"Qwen/Qwen3-0.6B"` 由引擎首次启动时自动拉取；国内网络环境可前置 `HF_ENDPOINT` 镜像变量。

### 脚本编写

**通过控制 `enforce_eager` 与 `speculative_config` 两个开关，即可在同一套提示词与贪心采样下隔离出三组无损加速模式的真实耗时差异。**

在当前工作目录 `execution-acceleration` 下新建文件 `bench_exec_modes.py`，填入以下完整代码（注意按本机环境替换 `MODEL_PATH`）：

```python
import argparse
import time
import torch
from vllm import LLM, SamplingParams

# 注意：将下方草拟路径替换为你的本机模型目录，或直接填写 "Qwen/Qwen3-0.6B" 自动拉取
MODEL_PATH = "/path/to/models/Qwen3-0.6B"

BASE_PROMPT = (
    "Here is a Python function. Rewrite the exact same function with type hints and a concise docstring:\n"
    "```python\n"
    "def compute_arithmetic_intensity(flops, bytes_moved):\n"
    "    if bytes_moved <= 0:\n"
    "        raise ValueError('bytes_moved must be positive')\n"
    "    return flops / bytes_moved\n"
    "```\n"
    "Rewritten Python function:\n```python\n"
)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["eager", "default", "ngram"], required=True)
    # batch-size=1 验证低并发延迟收益，batch-size=64 验证高并发计算受限拐点
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--repeats", type=int, default=1)
    args = parser.parse_args()

    kwargs = {}
    if args.mode == "eager":
        # 禁用 torch.compile 算子融合与 CUDA Graphs，退回逐算子 Eager 发射基线
        kwargs["enforce_eager"] = True
    elif args.mode == "default":
        # 启用 vLLM V1 默认编译优化与 FULL_AND_PIECEWISE 分段/全图 CUDA Graphs
        kwargs["enforce_eager"] = False
    elif args.mode == "ngram":
        kwargs["enforce_eager"] = False
        # 开启基于提示词 N-gram 匹配的投机解码：无需加载额外草稿模型，适合代码改写等高复用文本
        kwargs["speculative_config"] = {
            "method": "ngram",
            "num_speculative_tokens": 5,
            "prompt_lookup_max": 4,
        }

    llm = LLM(
        model=MODEL_PATH,
        dtype="bfloat16",
        max_model_len=2048,
        # 控制 KV Cache 预分配显存上限比例，适配 8GB~12GB 显存显卡；若显存紧张可调小至 0.35
        gpu_memory_utilization=0.5,
        disable_log_stats=True,
        **kwargs,
    )
    # 固定 temperature=0.0（贪心采样）并截断为 128 个词元，确保不同执行模式下的输出与步数完全对齐
    sampling = SamplingParams(temperature=0.0, max_tokens=128)
    prompts = [f"[req {i}] " + BASE_PROMPT for i in range(args.batch_size)]

    # Warmup：排除首次触发 CUDA 上下文初始化与 JIT 编译缓存对计时的干扰
    _ = llm.generate(prompts, sampling, use_tqdm=False)
    torch.cuda.synchronize()

    times = []
    total_tokens = 0
    for _ in range(args.repeats):
        t0 = time.perf_counter()
        outs = llm.generate(prompts, sampling, use_tqdm=False)
        torch.cuda.synchronize()
        times.append((time.perf_counter() - t0) * 1000.0)
        total_tokens = sum(len(o.outputs[0].token_ids) for o in outs)

    avg_ms = sum(times) / len(times)
    if args.batch_size == 1:
        print(f"RESULT mode={args.mode} tokens={total_tokens} avg_total_ms={avg_ms:.2f} avg_per_token_ms={avg_ms/total_tokens:.2f} tok_per_s={total_tokens/(avg_ms/1000.0):.1f}")
    else:
        print(f"BATCH_RESULT mode={args.mode} batch={args.batch_size} total_tokens={total_tokens} elapsed_ms={avg_ms:.2f} sys_tok_per_s={total_tokens/(avg_ms/1000.0):.1f}")

if __name__ == "__main__":
    main()
```

- **多进程入口保护**：`if __name__ == "__main__":` 必须保留，vLLM V1 默认采用 `spawn` 模式创建 `EngineCore` 子进程，缺少主入口保护会在启动阶段触发 `RuntimeError`。
- **三组开关含义**：`eager` 关闭融合与图捕获；`default` 打开 `torch.compile` 与 `FULL_AND_PIECEWISE` CUDA Graphs；`ngram` 额外启用最多前瞻 $5$ 步的 N-gram 投机解码。
- **精确同步计时**：`torch.cuda.synchronize()` 保证所有 GPU 计算与采样彻底完成后再止表，防止 CPU 异步返回导致计时虚低。

### 性能对比分析

**在 `batch=1` 下，算子融合叠加 CUDA Graphs 将单请求耗时压缩至基线的约三成，叠加投机解码进一步压至一成多；而在 `batch=64` 下，投机解码总吞吐出现回落。**

**第四步：运行单并发（`batch=1`）三组执行模式对照**

```bash
for m in eager default ngram; do
  python bench_exec_modes.py --mode "$m" --batch-size 1 --repeats 5
done
```

- **分进程独立测量**：每个 `--mode` 各自拉起独立 Python 进程，防止前一模式的显存缓存或图编译状态污染后续对比组；若模型已提前离线下载，可在命令前加 `HF_HUB_OFFLINE=1`。
- **冷启动耗时**：`default` 与 `ngram` 在引擎初始化时会用十余秒到二十余秒完成图编译以及捕获各档位 CUDA Graph，Warmup 轮次会将其排除在稳态计时之外。

**第五步：运行高并发（`batch=64`）拐点对照**

```bash
for m in default ngram; do
  python bench_exec_modes.py --mode "$m" --batch-size 64
done
```

- **对比意图**：当并发升至 $64$ 时，开启 $k=5$ 投机解码的验证矩阵总行数从 $64$ 放大至 $384$ 行，用于实测跨过硬件脊点后公式 (2) 预言的吞吐倒退现象。
- **显存适配**：如在 $8\text{ GB}$ 显存设备上运行，可将脚本内的 `max_model_len` 调整为 `1024`。

以下展示一组真实实测输出与汇总表（实测环境：**NVIDIA GeForce RTX 5070 12 GB**，**PyTorch `2.14.0+cu130`**，**CUDA `13.0`**，**vLLM `0.33.0`**，模型为 BF16 精度的 `Qwen3-0.6B`；不同硬件平台的绝对耗时有所差异，但三组模式间的相对倍率与并发拐点规律一致）：

```text
=== Running eager (batch=1, 5-run avg) ===
WARNING ... Enforce eager set, disabling torch.compile, CUDAGraphs, and JIT kernel warmup.
INFO ... Cudagraph is disabled under eager mode
RESULT mode=eager tokens=128 avg_total_ms=1004.07 avg_per_token_ms=7.84 tok_per_s=127.5

=== Running default (batch=1, 5-run avg) ===
... compilation_config={'mode': <CompilationMode.VLLM_COMPILE: 3>, ... 'cudagraph_mode': <CUDAGraphMode.FULL_AND_PIECEWISE: (2, 1)> ...}
INFO ... init engine (profile, create kv cache, warmup model) took 20.32 s (compilation: 10.42 s)
RESULT mode=default tokens=128 avg_total_ms=331.15 avg_per_token_ms=2.59 tok_per_s=386.5

=== Running ngram (batch=1, 5-run avg) ===
... speculative_config=SpeculativeConfig(method='ngram', model=None, num_spec_tokens=5) ...
INFO ... init engine (profile, create kv cache, warmup model) took 29.41 s (compilation: 10.44 s)
RESULT mode=ngram tokens=128 avg_total_ms=128.79 avg_per_token_ms=1.01 tok_per_s=993.8

=== Batch=64 High Concurrency Comparison ===
BATCH_RESULT mode=default batch=64 total_tokens=8192 elapsed_ms=630.13 sys_tok_per_s=13000.5
BATCH_RESULT mode=ngram batch=64 total_tokens=8192 elapsed_ms=670.47 sys_tok_per_s=12218.3
```

汇总为系统级对照表（观测口径：`torch.cuda.synchronize()` 包裹的单次端到端 `llm.generate()` 墙钟耗时，含 Prefill 与 128 步 Decode）：

| 测试组与并发度 | 开启机制 | 平均总耗时 (ms) | 单词元均摊耗时 (ms/tok) | 系统输出吞吐 (tok/s) | 相对基线倍率 |
|---|---|---:|---:|---:|---:|
| `batch=1` Eager 基线 | 无编译融合、无 CUDA Graphs | 1004.07 | 7.84 | 127.5 | 1.00× |
| `batch=1` Default 执行 | `torch.compile` + `FULL_AND_PIECEWISE` 图 | 331.15 | 2.59 | 386.5 | **3.03×** |
| `batch=1` N-gram 投机 | Default + N-gram 投机（$k=5$） | 128.79 | 1.01 | 993.8 | **7.80×** |
| `batch=64` Default 执行 | `torch.compile` + `FULL_AND_PIECEWISE` 图 | 630.13 | — | 13000.5 | 1.00× |
| `batch=64` N-gram 投机 | Default + N-gram 投机（$k=5$） | 670.47 | — | 12218.3 | **0.94×（变慢）** |

**执行结果分析与排查要点**：
1. **`batch=1` 下 CUDA Graphs 与算子融合收益显著**：从 `eager` 切至 `default` 后，单词元均摊耗时由 $7.84\text{ ms}$ 降至 $2.59\text{ ms}$（$3.03\times$ 加速）。初始化阶段一次性消耗约 $10.4\text{ s}$ 完成编译与图捕获，进入稳态请求后该开销彻底摊销。
2. **代码改写场景下投机解码再提速 $2.57\times$**：由于提示词内包含高度复用的函数模板，`ngram` 草稿命中率高，把 $128$ 词元总耗时进一步从 $331.15\text{ ms}$ 压到 $128.79\text{ ms}$。
3. **`batch=64` 实证并发拐点**：高并发下关闭投机解码的 `default` 吞吐达到 $13000.5\text{ tok/s}$，而开启 $k=5$ 投机解码后验证开销使耗时升至 $670.47\text{ ms}$，系统总吞吐反而回落 $6.0\%$。
4. **常见异常排查**：若报 `FileNotFoundError: 'ninja'`，检查虚拟环境 `bin` 目录是否已加入 `PATH`；若报 CUDA 编译器缺失，核查 `CUDA_HOME` 是否指向正确的 CUDA 安装路径（如 `/usr/local/cuda`）；若出现显存不足，调低 `gpu_memory_utilization` 并确认无其他进程占卡。

---

## 小结

无损执行与解码加速围绕 Decode 阶段的三道物理障碍展开：

- **算子融合**针对 GPU 片外 HBM 带宽墙，将相邻算子合并入寄存器与片上 SRAM 完成直传，受制于单个 SM 的寄存器容量与占用率边界。
- **CUDA Graphs** 针对 CPU 逐个下发造成的计算流气泡，用一次初始化 Capture 换取后续单次 Replay，依靠分桶填充与元数据静态化/分段图应对动态 Batch 与可变序列长度。
- **投机解码**针对自回归单步权重复用率为 1 的结构瓶颈，在中小并发访存受限区内借用闲置算力并行验证多步草稿并保证分布无损，而在高并发计算受限区必须关闭以防吞吐倒退。

实际性能调优时，应先使用系统级时间线分析工具 **NVIDIA Nsight Systems（`nsys`）** 排查发射间隙并优先落地算子融合与 CUDA Graphs，再结合业务高峰并发度所处的 Roofline 位置决定是否启用投机解码。

---

## 延伸阅读

- **投机解码奠基论文**：Yaniv Leviathan et al. [*Fast Inference from Transformers via Speculative Decoding*](https://arxiv.org/abs/2211.17192) (ICML 2023)；Charlie Chen et al. [*Accelerating Large Language Model Decoding with Speculative Sampling*](https://arxiv.org/abs/2302.01318) (2023)。
- **代表性投机架构论文**：Tianle Cai et al. [*Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads*](https://arxiv.org/abs/2401.10774) (ICML 2024)；Yuhui Li et al. [*EAGLE-3: Scaling up Inference Acceleration of Large Language Models via Training-Time Test*](https://arxiv.org/abs/2503.01840) (2025)。
- **CUDA Graphs 与 Roofline 官方文档**：[CUDA Programming Guide — CUDA Graphs](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/cuda-graphs.html) · [How to Scale Your Model — Roofline](https://jax-ml.github.io/scaling-book/roofline/)。
- **算子融合与编译实战**：[Triton Tutorials: Fused Softmax](https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html) · [PyTorch `torch.compiler` User Guide](https://pytorch.org/docs/stable/user_guide/torch_compiler.html) · [Accelerating PyTorch with CUDA Graphs](https://pytorch.org/blog/accelerating-pytorch-with-cuda-graphs/)。
- **推理引擎与中文课程**：[vLLM Speculative Decoding Docs](https://docs.vllm.ai/en/latest/features/speculative_decoding/) · [Datawhale × RadixArk · zero-to-sglang 第 10 章：投机解码](https://github.com/datawhalechina/zero-to-sglang/blob/main/course-material/ch/part2/%E7%AC%AC10%E7%AB%A0_%E6%8A%95%E6%9C%BA%E8%A7%A3%E7%A0%81.md)。
