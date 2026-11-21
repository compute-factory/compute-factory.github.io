---
title: 执行与解码加速
description: 不改变模型权重与数值精度，通过算子融合、CUDA Graphs 与投机解码消除 Decode 阶段的访存、调度与串行延迟瓶颈。
---

# 执行与解码加速

在大型语言模型（LLM）的推理优化体系中，很多手段会通过改变数值表示来换取速度，例如将权重量化为 INT8 或 FP8。但在不少线上业务中，团队希望在不改动模型权重、不改变数值精度、甚至保证输出概率分布与原模型严格一致的前提下，把生成延迟压到最低。

这一类优化统称为**无损执行与解码加速**。在开始拆解具体技术之前，我们先建立对推理两个基本阶段的共识：

- **Prefill（预填充阶段）**：推理引擎接收用户输入的完整提示词（Prompt），一次性并行计算所有输入 Token 的隐状态并写入 KV Cache[^kv-cache]，最终输出第 1 个生成 Token。该阶段直接决定了 **TTFT**（Time To First Token，首 Token 延迟）。
- **Decode（解码阶段）**：从生成第 2 个 Token 开始，模型进入自回归循环——每一步只能把上一步刚生成的 1 个 Token 喂回模型，计算并采样下一个 Token，直到遇到结束符或达到最大长度。每生成一个 Token 的平均耗时称为 **TPOT**（Time Per Output Token，单 Token 生成延迟）。

对于长文本生成任务，用户感知的流式输出流畅度主要由 Decode 阶段的 TPOT 决定。然而在实际部署中，工程师往往会发现一个反直觉的现象：Prefill 阶段 GPU 利用率可以拉满，到了 Decode 阶段，GPU 算力利用率却常常跌到不足 1%，计算单元大量周期处于空闲等待状态。

要理解并解决这一问题，必须先诊断清楚 Decode 阶段到底卡在哪里。

## Decode 为什么慢：算力闲置与双侧瓶颈

Decode 阶段的低效并非单一原因造成，而是由 **GPU 侧的显存带宽限制** 与 **CPU 侧的核函数发射开销** 共同构成的。

![LLM Decode 阶段的双侧瓶颈与三类无损加速路径](/images/inference/execution-acceleration/decode-bottlenecks.svg)

### GPU 侧瓶颈：算术强度极低导致的算力闲置

衡量一个算子是卡在计算能力还是卡在数据搬运上，在体系结构中通常使用 **算术强度（Arithmetic Intensity，简称 AI）**[^roofline] 来定量刻画：

$$
\text{AI} = \frac{\text{总浮点运算量（FLOPs）}}{\text{片外显存读写总字节数（Bytes）}}
$$

这里的“片外显存”指 GPU 主显存，即 **HBM**（High Bandwidth Memory，高带宽显存）[^hbm]。以 NVIDIA H100 SXM5 为例，其 FP16 Tensor Core 稠密算力峰值为 $989\text{ TFLOPS}$，而 HBM3 显存带宽为 $3.35\text{ TB/s}$。两者相除，可以得到这颗芯片在 FP16 精度下的硬件 **脊点（Ridge Point）**：

$$
\text{Ridge Point} = \frac{989\text{ TFLOPS}}{3.35\text{ TB/s}} \approx 295.2\text{ FLOPs/Byte}
$$

这个数字给出了一个明确的工程判据：在 H100 上，只有当算子每从 HBM 搬运 1 字节数据就能完成至少约 $295$ 次浮点运算时，Tensor Core 才能充分利用算力；低于这个值，计算单元就必须停下来等待 HBM 数据搬运，进入 **访存受限（Memory-Bound）** 状态。

我们把模型中最核心的线性层（矩阵乘法）代入公式，对比 Prefill 和 Decode 的算术强度。假设某个 FP16 线性层权重矩阵 $W$ 的形状为 $[D_{\text{in}}, D_{\text{out}}] = [4096, 4096]$（单矩阵占用显存约 $33.55\text{ MB}$），当前步输入的 Token 总数为 $B$：

- 浮点运算量：$\text{FLOPs} = 2 \cdot B \cdot D_{\text{in}} \cdot D_{\text{out}}$
- HBM 访存量：需要读取权重 $W$、输入激活 $X$ 并写回输出 $Y$，总字节数为 $\text{Bytes} = 2 D_{\text{in}} D_{\text{out}} + 2 B (D_{\text{in}} + D_{\text{out}})$

在 **Prefill 阶段**，假设单条请求输入长度为 $1024$（即 $B = 1024$），该算子属于 **GEMM**（General Matrix-Matrix Multiplication，通用矩阵-矩阵乘法）。此时每一份权重被 $1024$ 个 Token 共同复用，算术强度为：

$$
\text{AI}_{\text{Prefill}} = \frac{2 \times 1024 \times 4096^2}{2 \times 4096^2 + 2 \times 1024 \times 8192} = \frac{2048}{6} \approx 341.3\text{ FLOPs/Byte} > 295.2
$$

计算密度已经跨越硬件脊点，进入 **计算受限（Compute-Bound）** 区，Tensor Core 接近满载运行。

在单请求 **Decode 阶段**（$B = 1$），每步只能处理 $1$ 个新 Token，线性层退化为 **GEMV**（General Matrix-Vector Multiplication，通用矩阵-向量乘法）[^gemv]。此时每搬运一整块 $33.55\text{ MB}$ 的权重矩阵，只为这 $1$ 个向量做一次乘加，算术强度骤降为：

$$
\text{AI}_{\text{Decode}}(B=1) = \frac{2 \times 4096^2}{2 \times 4096^2 + 2 \times 8192} \approx 1.0\text{ FLOP/Byte}
$$

在 $\text{AI} \approx 1$ 时，H100 上该线性层所能达到的最高算力只有：

$$
3.35\text{ TB/s} \times 1.0\text{ FLOP/Byte} = 3.35\text{ TFLOPS}
$$

与 $989\text{ TFLOPS}$ 的峰值相比，算力利用率只有约 **$0.34\%$**。更进一步，Attention 层在 Decode 阶段还需要把整个历史序列的 KV Cache 从 HBM 读出来做点积，进一步加剧了带宽争抢。

![Roofline 视角下的 Prefill、Decode 与投机解码定位](/images/inference/execution-acceleration/roofline-decode.svg)

### CPU 侧瓶颈：碎片化算子与 Kernel 启动开销

除了 GPU 侧的 HBM 带宽墙，Decode 阶段还存在一个在延迟分析中极易被忽视的问题——**CPU 调度延迟**。

GPU 并不会自己读取模型结构并依次执行计算。在常规的 **Eager 模式**（即时执行模式）[^eager] 下，模型每向前推进一层，CPU 端的 Python 解释器与深度学习框架都要逐一解析张量形状、校验数据类型、分配临时显存，并通过 CUDA Driver/Runtime API 向 GPU 命令队列提交一个 **Kernel**（GPU 核函数）[^kernel]。这个从 CPU 发起调用到 GPU 真正开始执行核函数的过程所需的时间，称为 **Kernel Launch Overhead（核函数启动开销）**。

单次 CUDA Kernel 的纯驱动发射开销通常在数微秒（约 $3 \sim 10\text{ }\mu\text{s}$），如果算上 Python 框架侧的调度逻辑，开销可达数十微秒。在 Prefill 阶段，一个大矩阵乘 Kernel 本身要跑几百微秒甚至几毫秒，这几微秒的发射延迟可以忽略不计；但在小 Batch 的 Decode 阶段，一个 Transformer 层内部包含 `RMSNorm`、`QKV Projection`、`RoPE`、`Attention`、`O Projection`、`Residual Add`、`Gate/Up/Down Projection`、`SwiGLU` 等十几个独立算子，其中大量逐元素运算和归一化 Kernel 在 GPU 上的实际计算时间只有 $2 \sim 5\text{ }\mu\text{s}$。

当 CPU 下发速度赶不上 GPU 执行速度时，GPU 计算流上就会出现大量“等指令”的空闲间隙（气泡）。一个拥有 32 到 80 层的模型，单步 Decode 就要经历数百次 Kernel 启动，累积起来的 CPU 调度时间甚至能占到整步延迟的 $30\% \sim 50\%$。

### 三把无损加速钥匙的分工

明确了这两侧瓶颈之后，整个章节的三项核心技术就有了非常清晰的分工：

1. **算子融合（Operator Fusion）**：把多个连续的小算子合并成一个 Kernel，让中间结果留在 GPU 片上寄存器和共享内存中，直接削减 HBM 读写往返次数，并顺带减少 Kernel 数量。
2. **CUDA Graphs**：把整段计算图预先录制下来，推理时 CPU 只需发射一次图重放指令，彻底消除层间数百次 Kernel Launch 带来的调度空泡。
3. **投机解码（Speculative Decoding）**：既然单步只算 1 个 Token 喂不饱算力，就用极轻量的草稿先猜出 $\gamma$ 个后续 Token，让大模型在单次前向传播中并行验证它们，用原本闲置的算力换取单步多 Token 产出。

这三项技术正交且可以叠加。下面我们逐一深入它们的物理机制、工程实现与边界条件。

---

## 算子融合：把多次显存往返压缩进片上缓存

### GPU 存储层级与 HBM 往返代价

理解算子融合为什么有效，只需要记住一个硬件事实：GPU 芯片内部的计算单元与片外 HBM 之间隔着一条狭窄的显存总线，而计算单元身边的片上存储（**寄存器 Registers** 与 **片上共享内存 Shared Memory / SRAM**）[^sram] 速度极快。

- **HBM（片外全局显存）**：容量大（几十 GB），但访问延迟高（数百个时钟周期），总带宽在 TB/s 量级（如 H100 为 $3.35\text{ TB/s}$）。
- **片上 SRAM 与寄存器**：容量小（每个流式多处理器 SM 仅有数百 KB），但延迟极低，聚合片上带宽可达数十 TB/s 乃至更高，比 HBM 高出一个数量级以上。

在未融合的常规框架执行中，每一个独立算子都必须遵守“从 HBM 读入输入 $\rightarrow$ 在片上计算 $\rightarrow$ 把输出写回 HBM”的固定流程。对于矩阵乘法这种计算密集型算子，写回一次结果的开销微不足道；但对于归一化（RMSNorm/LayerNorm）、残差相加（Residual Add）、旋转位置编码（RoPE）、激活函数（SiLU/GELU）这类访存密集型算子（每个元素只做寥寥几次乘加），几乎全部时间都耗费在了跨 HBM 总线的数据搬运上。

### 推理中的典型融合模式

我们以 LLM 每个解码层都会执行两次的 `Residual Add + RMSNorm` 组合，以及前馈网络中的 `SwiGLU` 激活为例，定量计算显存带宽开销。

![算子融合对比：以 Residual Add + RMSNorm 为例](/images/inference/execution-acceleration/operator-fusion.svg)

#### 模式一：访存密集型算子链融合（Memory-Bound Fusion）

在 Llama 架构的 Pre-Norm 模块中，算子会依次执行残差相加和均方根归一化：

```text
sum_buf  = x + residual          # Kernel 1: Residual Add
norm_out = rmsnorm(sum_buf) * γ  # Kernel 2: RMSNorm
```

假设输入张量 `x` 和 `residual` 的字节大小均为 $S$（向量权重 `γ` 的体积远小于激活张量，此处忽略不计）：

- **未融合执行**：`Kernel 1` 从 HBM 读取 `x`（$S$）和 `residual`（$S$），写回 `sum_buf`（$S$），耗费 $3S$ 流量；`Kernel 2` 再从 HBM 重新读取 `sum_buf`（$S$），归一化后写回 `norm_out`（$S$），耗费 $2S$ 流量。两步合计搬运 **$5S$ 字节**，触发 **2 次 Kernel 启动**。
- **融合执行（`FusedAddRMSNorm`）**：单个 Kernel 从 HBM 读入 `x`（$S$）和 `residual`（$S$）后，直接在线程寄存器中完成 `sum = x + residual`；紧接着不落盘回 HBM，直接在当前线程块（Thread Block）的寄存器与 Shared Memory 中完成平方和归约与缩放，最后将 `norm_out`（$S$）以及供下一层使用的更新后 `residual`（$S$）一次性写回 HBM。总流量降为 **$4S$ 字节**，且合并为 **1 次 Kernel 启动**。

对于不需要保留中间变量的 `SwiGLU` 逐元素激活（$\text{out} = \text{SiLU}(\text{gate}) \odot \text{up}$），收益更为显著：未融合时需要写出再重读 `silu(gate)`，共搬运 $5S$ 字节；融合为单个 `FusedSiluAndMul` Kernel 后，只需读 `gate`、读 `up`、写 `out`，总访存量从 $5S$ 锐减至 **$3S$ 字节**，直接省去 $40\%$ 的 HBM 流量。

#### 模式二：矩阵乘后处理融合（GEMM Epilogue Fusion）与 Attention 融合

除纯逐元素链之外，现代推理引擎还会把小算子合并到大算子的尾部或内部：

- **Epilogue 融合**：在矩阵乘（GEMM/GEMV）把结果从累加寄存器写回 HBM 之前，顺手在寄存器里完成加偏置（Bias Add）、激活函数或输出量化（Cast to FP8/INT8），避免专门再起一次逐元素 Kernel。
- **Attention 融合（FlashAttention / FlashDecoding）**：传统注意力需要把巨大的注意力分数矩阵 $S = QK^T$ 写回 HBM，再做 Softmax，再读回来乘 $V$。融合算子通过分块（Tiling）与在线 Softmax（Online Softmax）将中间分数矩阵完全锁在片上 SRAM 中，把注意力计算的 HBM 读写复杂度从序列长度的平方级压降为线性级。

### 手工融合、编译器自动融合与物理边界

在工程实现上，算子融合主要有两条路径：

1. **手工编写专用 Kernel（CUDA / CUTLASS / Triton）**：针对高频固定模式（如 `FusedAddRMSNorm`、`FusedRoPE`、`FlashAttention`），由引擎作者手工编写高度优化的核函数。下面是一段使用 **Triton**[^triton] 编写融合版 `SiLU + 逐元素乘法` 的核心逻辑示意——通过一次指针加载将两个张量读入寄存器，在芯片内部完成运算后直接写出：

```python
import triton
import triton.language as tl

@triton.jit
def fused_silu_mul_kernel(
    gate_ptr, up_ptr, out_ptr, n_elements,
    BLOCK_SIZE: tl.constexpr,
):
    pid = tl.program_id(axis=0)
    offsets = pid * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)
    mask = offsets < n_elements

    # 1. 从 HBM 一次读入两个输入张量块，加载到片上寄存器
    gate = tl.load(gate_ptr + offsets, mask=mask, other=0.0).to(tl.float32)
    up = tl.load(up_ptr + offsets, mask=mask, other=0.0).to(tl.float32)

    # 2. 全部计算在寄存器内完成，中间结果不回写 HBM
    silu_gate = gate * tl.sigmoid(gate)
    out = silu_gate * up

    # 3. 仅将最终结果写回 HBM
    tl.store(out_ptr + offsets, out.to(gate_ptr.dtype.element_ty), mask=mask)
```

2. **编译器自动融合（如 `torch.compile` / TorchInductor）**：对于大量结构多变的逐元素或归约组合（例如采样前的温度缩放、Top-K/Top-P 掩码、惩罚项计算），编译器会自动把计算图切分成子图，生成融合后的 Triton Kernel，无需人工维护数十个变体。

**那么，是不是把越多算子融进一个 Kernel 就越好？** 答案是否定的。算子融合存在明确的硬件资源边界：

- **寄存器压力（Register Pressure）与占用率（Occupancy）下降**[^occupancy]：融合进来的逻辑越复杂，单个线程需要同时维护的中间变量就越多，分配给每个线程的寄存器数量随之膨胀。GPU 每个 SM 上的寄存器总量是固定的，单线程占用寄存器过多会迫使 SM 减少同时驻留的线程块数量（即占用率下降），严重时甚至发生 **寄存器溢出（Register Spilling）**——编译器被迫把多出来的变量退回给慢速的本地显存（本质上仍在 HBM 上），反而使融合收益归零甚至倒退。
- **跨归约维度屏障**：融合天然适合相同的并行切分维度（例如都按 Token 行并行）。一旦相邻算子需要改变并行切分轴（例如前一步按行归约，后一步需要跨所有行做全局归约），就必须同步全局数据，通常需要在算子边界切开。

---

## CUDA Graphs：用一次图重放取代上百次 Kernel 启动

解决了相邻算子之间的 HBM 往返之后，Decode 阶段依然存在几十个无法合并的 Kernel（例如各层之间独立的线性投影、Attention 与通信算子）。如果仍然由 CPU 逐个启动它们，GPU 上依然会布满发射空泡。**CUDA Graphs**[^cudagraphs] 正是为了彻底抹平 CPU 侧的调度延迟而设计的执行机制。

![CUDA Graphs 时间线对比与分段图机制](/images/inference/execution-acceleration/cuda-graphs-timeline.svg)

### Capture 与 Replay 的两阶段机制

CUDA Graphs 的核心思想非常简单：Decode 每一步执行的算子序列结构高度重复，既然每次算子拓扑都相同，就没有必要每跑一步都让 CPU 重新走一遍 Python 解析、形状推导和驱动提交流程。

它将执行拆分为 **录制（Capture）** 与 **重放（Replay）** 两个阶段：

1. **图捕获（Graph Capture）**：引擎先将 CUDA 流置于捕获模式（`cudaStreamBeginCapture`），然后正常跑一遍前向传播。在这个过程中，GPU **并不真正执行计算**，CUDA 驱动只是把这一次跑过的所有 Kernel、Kernel 之间的依赖边、Grid/Block 启动配置以及每个输入输出张量绑定的**固定显存虚拟地址**记录下来，在底层构建一张有向无环图（DAG），随后调用 `cudaGraphInstantiate` 将其编译固化为可执行图实例。
2. **图重放（Graph Replay）**：到了真实推理阶段，引擎只需将新一步的输入数据（例如新的 `input_ids` 和位置索引）拷贝进 Capture 阶段绑定的那几块固定输入显存缓冲区，然后 CPU 调用一次 `cudaGraphLaunch`（在 PyTorch 中即 `graph.replay()`）。驱动把整张包含上百个 Kernel 的图一次性提交给 GPU 硬件调度器，后续全部 Kernel 由 GPU 在内部背靠背连续拉起，CPU 在提交完成的那一刻即可立刻抽身去准备下一轮请求的调度逻辑。

在 PyTorch 中，使用 CUDA Graph 的最小工程模式如下：

```python
import torch

# 1. 预先分配固定地址的静态输入缓冲（Static Buffers）
static_input = torch.empty((batch_size, hidden_dim), dtype=torch.float16, device="cuda")
static_output = torch.empty_like(static_input)

# 2. Warmup：触发 CUDA 上下文、cuBLAS 句柄与显存分配器初始化（不可在 Capture 中首次初始化）
s = torch.cuda.Stream()
s.wait_stream(torch.cuda.current_stream())
with torch.cuda.stream(s):
    for _ in range(3):
        static_output.copy_(decode_step(static_input))
torch.cuda.current_stream().wait_stream(s)

# 3. Capture：捕获整段计算图
g = torch.cuda.CUDAGraph()
with torch.cuda.graph(g):
    static_output.copy_(decode_step(static_input))

# 4. Replay：推理循环中只需原地更新静态缓冲并重放
for step_tensor in incoming_steps:
    static_input.copy_(step_tensor)  # 原地拷贝，保持显存指针地址不变
    g.replay()
    # 此时 static_output 中即为本步结果
```

### 动态推理场景下的三大工程约束

上述极简代码看起来很完美，但把它放进真实的 LLM 服务引擎（如 vLLM、SGLang、TensorRT-LLM）时，会立刻撞上 CUDA Graphs 的三大硬性限制：

1. **禁止动态控制流与主机同步**：Capture 阶段录制的是固定的操作序列。计算过程内部不能出现依赖 GPU 计算结果的 `if/else` 分支，也不能调用 `tensor.item()` 或 `cudaStreamSynchronize` 把控制权同步回 CPU。
2. **张量形状与内存地址必须静态不变**：图一旦实例化，每个 Kernel 读取的张量指针和维度就固定了。但在真实线上服务中，**连续批处理（Continuous Batching）**[^continuous-batching] 的实时并发请求数（Batch Size）每一步都在增减，每条请求的上下文历史长度（Sequence Length）每一步也在增长，KV Cache 物理块索引表（Block Table）也在动态变化。
3. **显存静态占用成本**：每一张独立捕获的 CUDA Graph 都需要持有其内部激活张量的静态显存池（尽管多个图之间可以共享同一块私有显存池以减少冗余，但图的数量依然不能无限膨胀）。

### 推理引擎解法：分桶填充与分段图捕获

为了在动态服务场景下依然用上 CUDA Graphs，现代推理引擎普遍采用以下两项组合策略：

- **分桶与填充（Bucketing & Padding）应对动态 Batch Size**
  引擎不会为每一种可能出现的 Batch Size（例如 1 到 256）分别录制 256 张图，而是在启动预热阶段，只针对一组预先选定的离散档位（例如 `[1, 2, 4, 8, 16, 24, 32, 48, 64, 128, 256]`）预先捕获对应的 CUDA Graph。
  当某一步真实到达的请求数为 $b = 11$ 时，调度器会向上对齐到最近的桶 $B_{\text{bucket}} = 16$，用空数据将输入张量补齐（Padding）到 16 行，并在图外或掩码中确保补齐行不污染实际请求的 KV Cache。为了控制补齐带来的额外显存和算力浪费，小 Batch 区间分桶更密集（如步长 1 或 2），大 Batch 区间步长更宽（如步长 16 或 32）。
- **静态地址元信息与分段图捕获（Piecewise CUDA Graph）应对动态序列长度**
  针对每步都在增长的序列长度与 KV Cache 块表，引擎主要有两种应对方式：
  - **支持全图捕获的 Attention 后端（Full CUDA Graph）**：将 `seq_lens`、`block_tables`、`slot_mapping` 等动态变化的元数据张量也放进固定地址的 GPU 静态缓冲区中，每步 `replay()` 前仅原地覆写这些元数据数组里的数值，Attention Kernel 内部直接读取静态指针上的最新长度值，从而让整模型前向传播被捕获进同一张大图。
  - **分段图捕获（Piecewise CUDA Graph）**：当遇到不支持全图静态化的混合批（如将长提示词切分后与解码请求混跑的 **分块预填充 Chunked Prefill**[^chunked-prefill]）或某些动态算子时（例如 vLLM 的 `PIECEWISE` 模式），编译器会在 Attention 算子边界处把模型计算图切开——Attention 之前（`RMSNorm + QKV 投影 + RoPE`）捕获为一段静态图，Attention 本身以 Eager 模式灵活运行，Attention 之后（`O 投影 + Residual + MLP`）再捕获为另一段静态图。这样既保留了对动态序列和复杂注意力后端的完全兼容性，又把绝大部分层内小算子的启动开销收入了 CUDA Graph。

---

## 投机解码：以验证并行性换取生成延迟

算子融合降低了单步 HBM 搬运量，CUDA Graphs 消除了 CPU 调度气泡，这两项技术都在**压榨单步前向传播耗时**。但它们无法改变自回归解码的一个根本瓶颈：每一步前向传播，都必须把模型全部权重从 HBM 读进片上一次，而最终只能产出 **1 个** Token。

**投机解码（Speculative Decoding）**[^speculative] 从另一个维度打破了这一限制：**既然单步只算 1 个 Token 时 GPU 计算单元大量闲置，那能否在读取一次目标模型权重的同时，一口气验证多个候选 Token，让单步产出多个确定正确的 Token？**

![投机解码单轮 Draft-then-Verify 流程](/images/inference/execution-acceleration/speculative-decoding.svg)

### 为什么验证 K 个 Token 与生成 1 个 Token 耗时接近

回看我们在第一节推导的 Roofline 模型：在 H100 上，单请求 Decode（$B=1$）的算术强度约为 $1.0\text{ FLOP/Byte}$，距离脊点 $295.2\text{ FLOPs/Byte}$ 相差两个多数量级。

这意味着，如果我们把送入目标大模型（Target Model）的序列输入从 $1$ 个 Token 变成 $\gamma + 1 = 5$ 个候选 Token（批量并行前向传播，并通过**因果掩码（Causal Mask）**[^causal-mask] 确保每个位置只关注其自身及更早的输入）：

- 模型的权重矩阵 $W$ 依然只需要从 HBM **读取一次**；
- 矩阵乘的浮点运算量虽然增大到原来的 5 倍（算术强度升至约 $5\text{ FLOPs/Byte}$），但它仍然远远处于脊点左侧的 **Memory-Bound 区域**！
- 决定耗时的是那块 $33.55\text{ MB}$ 权重的搬运时间，而不是片上计算时间。因此，在中小 Batch 下，**目标模型并行验证 5 个 Token 的耗时几乎与生成 1 个 Token 相同**。

### Draft-then-Verify 工作流程与数学无损性

当然，大模型要想并行验证 5 个位置，必须先知道这几个位置“可能填什么词”。投机解码的每一轮执行分为三个严格步骤：

1. **草稿生成（Drafting）**：使用一个成本极低的轻量级机制——**草稿模型（Draft Model）**（通常是一个小得多的同词表模型，或专门挂载在主干上的轻量级预测头），从当前已知前缀出发，快速自回归生成 $\gamma$ 个候选 Token $x_1, x_2, \dots, x_\gamma$，并记录草稿模型在每一步给出的概率分布 $q_1, q_2, \dots, q_\gamma$。
2. **并行验证（Parallel Verification）**：将前缀末尾词连同这 $\gamma$ 个候选 Token 拼接成长度为 $\gamma + 1$ 的序列段，喂给**目标模型（Target Model）**。目标模型只需做 **1 次** 前向传播，即可并行计算出这 $\gamma + 1$ 个位置的精确概率分布 $p_1, p_2, \dots, p_\gamma, p_{\gamma+1}$。
3. **逐位拒绝采样（Rejection Sampling）**：按顺序从 $i = 1$ 到 $\gamma$ 逐个校验候选 Token $x_i$，规则如下：
   - 如果 $p_i(x_i) \ge q_i(x_i)$，说明目标模型比草稿模型更看好这个词，**直接接受 $x_i$**。
   - 如果 $p_i(x_i) < q_i(x_i)$，则以概率 $\frac{p_i(x_i)}{q_i(x_i)}$ 接受 $x_i$，否则 **拒绝 $x_i$**。
   - 一旦某个位置 $i$ 被拒绝，说明后续猜想的 $x_{i+1}, \dots, x_\gamma$ 是基于错误前缀生成的，必须全部作废；同时，在位置 $i$ 上，从修正残差分布 $p'_i(x) = \text{norm}(\max(0, p_i(x) - q_i(x)))$ 中重新采样一个新词 $x'_i$ 作为本位置最终输出，并终止本轮校验。
   - 如果全部 $\gamma$ 个候选 Token 都通过了校验，那么目标模型在并行计算时顺带算出的第 $\gamma + 1$ 个位置分布 $p_{\gamma + 1}$ 也是现成的，直接从 $p_{\gamma + 1}$ 采样出第 $\gamma + 1$ 个词（**Bonus Token**）。

换言之，每经过一轮“1 次草稿生成 + 1 次目标模型验证”，系统至少能保证产出 $1$ 个正确 Token（最坏情况第一个词就被拒，用 $p'_1$ 重采样），最多能一次性推进 $\gamma + 1$ 个 Token，并同步裁剪掉被拒绝位置之后对应的无效 KV Cache。

**为什么这套机制能做到“数学严格无损”？**
在温度采样（$T > 0$）下，我们可以直接验证任意位置输出某个词 $x$ 的总概率[^proof]：接受概率与拒绝重采样概率之和恰好等于 $\min(q_i(x), p_i(x)) + \max(0, p_i(x) - q_i(x)) = p_i(x)$。而在贪心解码（Greedy Decoding，$T = 0$）下，它等价于直接比对 $\text{argmax } p_i$ 与 $x_i$ 是否一致，不一致则替换为 $\text{argmax } p_i$。因此，无论草稿模型质量高低，最终输出序列的分布与单独运行目标模型在数学上 **100% 完全一致**。

### 加速比的理论边界：何时有效，何时反而变慢

投机解码并非在所有场景下都能带来加速。我们可以用三个关键参数直接写出它的期望端到端加速比边界：

- **平均接收率 $\alpha \in (0, 1)$**：草稿模型猜出的词被目标模型接受的平均概率。
- **草稿步长 $\gamma$**：每轮猜多少个词。
- **单步草稿相对耗时 $c = T_{\text{draft}}(1) / T_{\text{target}}(1)$**：草稿模型生成 1 个词耗时与目标模型生成 1 个词耗时之比（通常要求 $c \ll 1$，例如 $0.02 \sim 0.1$）。
- **目标模型验证膨胀系数 $r_{\text{verify}}(\gamma) = T_{\text{target}}(\gamma + 1) / T_{\text{target}}(1)$**：目标模型并行验证 $\gamma + 1$ 个词耗时与单步生成 1 个词耗时之比。

在一轮内，若每个位置的接收事件近似独立，期望产出的净 Token 数为：

$$
\mathbb{E}[\text{Tokens}] = \sum_{k=0}^{\gamma} \alpha^k = \frac{1 - \alpha^{\gamma + 1}}{1 - \alpha}
$$

一轮的总耗时相对倍数为 $c \cdot \gamma + r_{\text{verify}}(\gamma)$，由此得到理论期望加速比：

$$
\text{Speedup} = \frac{1 - \alpha^{\gamma + 1}}{(1 - \alpha)\bigl(c \cdot \gamma + r_{\text{verify}}(\gamma)\bigr)}
$$

由这条公式可以立即推出工程落地的三条硬边界：

1. **草稿质量与步长的权衡**：如果 $\alpha$ 较高（例如代码补全、模板化文本或高置信度推理场景，$\alpha \approx 0.8$），单轮期望产出接近 $3 \sim 4$ 个 Token，加速效果显著；如果任务高度发散导致 $\alpha$ 很低（如 $\alpha < 0.4$），加大 $\gamma$ 只会白白增加分子几乎不涨的无效草稿开销 $c \cdot \gamma$，此时加速比会迅速跌破 $1.0$（反而变慢）。因此许多引擎引入了动态 $\gamma$ 调整，在历史接收率低时自动缩短猜想长度。
2. **草稿本身必须足够轻（$c \ll 1$）**：独立小模型不能过大，否则 $\gamma$ 步串行执行草稿模型加上其自身的 Kernel 启动开销，会抵消大部分加速收益。
3. **高并发大 Batch Size 下加速比会迅速坍塌**：这是生产环境最常见的性能误区。在 $B=1$ 时，$r_{\text{verify}}(\gamma) \approx 1.0$；但当在线服务的连续批处理并发达到 $B = 64$ 或 $128$ 时，目标模型输入矩阵的总行数会乘以 $(\gamma + 1)$，迅速变成 $64 \times 5 = 320$ 行。此时算子已经跨过硬件脊点进入 Compute-Bound 区域（参见第一节的 Roofline 图），$r_{\text{verify}}(\gamma)$ 不再接近 $1$，而是向 $(\gamma + 1)$ 线性攀升。分母膨胀的倍数会直接抵消甚至反超分子上的 $\mathbb{E}[\text{Tokens}]$ 收益，导致投机解码不仅无法加速，还额外浪费了一倍以上的算力和 KV Cache 带宽。因此，**投机解码的核心适用场景是低并发、极度追求低 TPOT 延迟的请求**。

### Draft 来源的演进方向

为了同时压低相对耗时 $c$ 并提高接收率 $\alpha$，社区在“如何生成草稿”上经历了清晰的三代演进：

- **第一代：独立小模型（Independent Draft Model）**：例如用同家族的 0.5B/1B 模型辅助 70B 大模型。优点是无需训练、开箱即用；缺点是小模型往往很难精准对齐大模型的长尾分布，且在多机多卡并行部署时需要额外维护一套独立模型的权重与 KV Cache。
- **第二代：无辅助模型的轻量级多头预测（如 Medusa）**：不单独部署小模型，而是在大模型最后一层隐状态之上微调挂载 $\gamma$ 个轻量的线性预测头，一次前向同时预测未来多步。缺点是各个头独立预测互不知晓，彼此之间缺乏条件依赖，接收率受限。
- **第三代：基于特征自回归与树状验证（如 EAGLE 系列）**：不再从词表层重启一个独立小模型，而是直接复用目标模型倒数第二层富含上下文语义的隐藏特征（Feature），配合一个极轻量的单层自回归层快速滚动生成候选树（Tree Attention Verification），在保持 $c$ 极低的同时大幅拉高接收率 $\alpha$，并可与 **CUDA Graphs** 结合实现微秒级草稿步进。

---

## 三项技术的组合顺序与诊断清单

在真实的推理引擎（例如 vLLM 或 SGLang）中，这三项技术并不是非此即彼的选择题，而是按 Bottleneck 逐层叠加的流水线。

| 优化技术 | 解决的核心瓶颈 | 生效前提 | 工程代价与主要约束 |
| :--- | :--- | :--- | :--- |
| **算子融合** | HBM 带宽往返与相邻小 Kernel 开销 | 任意阶段（尤其 Decode 的 Norm/激活链与 Attention） | 增大单 Kernel 寄存器压力；算子变体多时需借助编译器（`torch.compile` / Triton） |
| **CUDA Graphs** | CPU 侧逐个下发 Kernel 的调度延迟气泡 | 算子拓扑静态、形状可控（Decode 阶段最为明显） | 需预先分配静态缓冲池；需用分桶填充或分段图应对动态 Batch 与序列长度 |
| **投机解码** | 单步仅产出 1 个 Token 导致的极低算术强度 | 系统处于 Memory-Bound（低/中并发 Batch）且接收率 $\alpha$ 足够高 | 大 Batch（Compute-Bound）下无效甚至负优化；树验证与拒绝采样增加调度复杂度 |

在实际开展性能调优时，建议按照以下四步诊断顺序推进，避免盲目开启高复杂度特性：

1. **先用 NVIDIA Nsight Systems（`nsys`）[^nsys] 抓取 Decode 阶段时间线**。如果看到 GPU 计算流上相邻 Kernel 之间存在明显空白间隙，且 CPU 线程处于 `cudaLaunchKernel` 密集调用中，说明系统存在明显的发射开销瓶颈。
2. **优先确保算子融合与 CUDA Graphs 落地**。先通过引擎自带的融合算子（如 `FusedAddRMSNorm`、`FlashAttention`）压缩 HBM 往返并减少 Kernel 总数，再开启 CUDA Graphs（全图或分段图）消除剩余的发射间隙。这两步对于任意并发度下的单步耗时都有稳定收益，且不引入概率分支逻辑。
3. **再用 NVIDIA Nsight Compute（`ncu`）[^ncu] 或 Roofline 分析确认是否仍处于 Memory-Bound**。观察业务高峰期的典型 Batch Size 下，GEMM/GEMV 算子的 Tensor Core 算力利用率与 HBM 带宽利用率。
4. **仅在低延迟、低并发的 Memory-Bound 场景引入投机解码**。如果线上业务长期处于小 Batch 交互模式（如本地代码助手、个人 Agent、低并发专用服务），此时引入投机解码（或 EAGLE 类轻量级草稿机制）可以把单步 TPOT 再降低 $1.5 \times \sim 2.5 \times$；如果业务核心指标是高并发吞吐量（Batch 经常拉满至 Compute-Bound 平台区），则应关闭投机解码，把全部算力留给真实用户的并行批处理。

---

## 延伸阅读

- **投机解码开山论文（Google Research）**：Yaniv Leviathan, Matan Kalman, Yossi Matias. [*Fast Inference from Transformers via Speculative Decoding*](https://arxiv.org/abs/2211.17192) (ICML 2023 Oral). 系统性提出了 Draft-then-Verify 框架、拒绝采样等价性证明及理论加速比公式。
- **同期独立工作（DeepMind）**：Charlie Chen et al. [*Accelerating Large Language Model Decoding with Speculative Sampling*](https://arxiv.org/abs/2302.01318) (2023). 在 70B Chinchilla 模型上详细验证了 2–2.5× 解码加速及与张量并行的结合方式。
- **特征级自回归投机解码**：Yuhui Li et al. [*EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty*](https://arxiv.org/abs/2401.15077) (ICML 2024). 阐述了如何从特征层而非词表层做轻量草稿预测以突破接收率上限。
- **CUDA Graphs 官方文档与 PyTorch 实践**：
  - [NVIDIA CUDA Programming Guide — CUDA Graphs](https://docs.nvidia.com/cuda/cuda-programming-guide/index.html)
  - [Accelerating PyTorch with CUDA Graphs (PyTorch Official Blog)](https://pytorch.org/blog/accelerating-pytorch-with-cuda-graphs/)
- **算子融合与自动编译实战**：
  - [Triton Tutorials: Fused Softmax](https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html) — 从零对比 PyTorch 原生操作与单 Kernel SRAM 驻留融合的经典入门教程。
  - [PyTorch `torch.compiler` User Guide](https://pytorch.org/docs/stable/user_guide/torch_compiler.html) — 了解 TorchInductor 如何自动完成计算图切分与 Triton Kernel 融合。
- **推理引擎生产级实现参考**：
  - [vLLM Documentation](https://docs.vllm.ai/en/stable/) — 可查阅其中关于 `torch.compile` 集成及 `PIECEWISE` / `FULL` CUDA Graph 模式的工程设计细节。

[^kv-cache]: **KV Cache（键值缓存）**：自回归生成过程中，Transformer 每一层都会把历史所有 Token 计算得到的 Key 和 Value 向量缓存在显存中，从而避免每生成新 Token 时重复计算历史前缀的投影。它在消除了重复计算的同时，也使 Decode 阶段每次 Attention 计算都必须把庞大的历史 KV 张量从显存重新读取一遍。
[^roofline]: **Roofline 模型（屋顶线模型）**：一种把硬件算力峰值（FLOPS，水平屋顶线）与显存带宽上限（Bytes/s，斜屋顶线）画在对数坐标系上的性能分析模型。斜线与水平线的交点称为 **脊点（Ridge Point）**，其横坐标等于“峰值算力 / 显存带宽”。算术强度低于脊点的算子受限于带宽斜线（Memory-Bound），高于脊点的算子受限于水平算力线（Compute-Bound）。
[^hbm]: **HBM（High Bandwidth Memory）**：通过硅通孔（TSV）与中介层（Interposer）紧邻 GPU 计算芯片封装的高带宽堆叠显存。它是目前大容量 GPU 的主显存，容量可达数十至上百 GB，但相比芯片内部的 SRAM 仍属于“片外存储”。
[^gemv]: **GEMM 与 GEMV**：GEMM 指两个矩阵相乘（$M \times K$ 乘以 $K \times N$），当矩阵行数 $M$ 足够大时，权重矩阵 $K \times N$ 中的每个元素可以被多次复用；GEMV 指向量与矩阵相乘（$1 \times K$ 乘以 $K \times N$），权重元素读入后仅参与一次内积累加，无法摊薄访存成本。
[^eager]: **Eager 模式（即时执行模式）**：PyTorch 默认的执行方式。CPU 每执行到一行算子代码，就立即向 GPU 提交对应任务并返回，方便调试和动态控制流，但在包含数百个微秒级小算子的循环中会积累显著的 CPU 调度开销。
[^kernel]: **Kernel（核函数）与 Kernel Launch Overhead**：Kernel 是在 GPU 上并行执行的函数实体。每次 CPU 通过 CUDA Runtime API（如 `cudaLaunchKernel`）向 GPU 提交一个 Kernel，都需要经过参数打包、用户态到内核态/驱动队列写入、硬件命令处理器解析等步骤，这段耗时在微秒级，与 Kernel 本身的计算量无关。
[^sram]: **寄存器（Registers）与 Shared Memory（片上共享内存）**：位于 GPU 每个流式多处理器（SM）内部的片上高速存储。寄存器为单线程私有，访问延迟接近零；Shared Memory 由同一线程块（Thread Block）内的线程共享，本质上是可编程管理的片上 SRAM，用于线程间高效交换中间结果，避免回写 HBM。
[^triton]: **Triton**：由 OpenAI 开源的面向 GPU 的 Python 领域特定语言（DSL）与编译器。开发者无需手写繁琐的 CUDA C++ 线程索引与 Shared Memory 同步原语，只需以数据块（Block）为单位编写计算逻辑，即可生成接近手写 CUDA 性能的融合 Kernel。
[^occupancy]: **占用率（Occupancy）与寄存器压力**：占用率指单个 SM 上实际活跃的线程束（Warp）数量与硬件支持上限的比值。高占用率有助于隐藏显存访存延迟。如果单个融合 Kernel 使用了过多局部变量，编译器分配的每线程寄存器数升高，受限于 SM 固定总寄存器池大小，硬件能同时调度的线程块数量就会减少，从而拉低占用率。
[^cudagraphs]: **CUDA Graphs**：NVIDIA CUDA 10 引入的执行抽象。它把一系列依赖明确的 GPU 操作（Kernel 启动、显存拷贝、事件同步等）及其固定内存地址预先组织成静态图结构，将原本分散在运行时的 CPU 驱动调度工作前移至初始化录制阶段。
[^speculative]: **投机解码（Speculative Decoding）**：又称 Speculative Sampling。它借鉴计算机体系结构中 CPU 分支预测与投机执行的思想：先低成本猜想后续结果，再由高成本主单元一次并行验证，猜对直接跳过多步串行，猜错则回退修正。
[^proof]: **拒绝采样分布等价性简证**：设目标分布为 $p(x)$，草稿分布为 $q(x)$。单个位置接受 $x$ 的概率为 $q(x) \cdot \min\bigl(1, \frac{p(x)}{q(x)}\bigr) = \min(q(x), p(x))$。由此可得该位置发生拒绝的总概率为 $\beta = 1 - \sum_y \min(q(y), p(y)) = \sum_y \max(0, p(y) - q(y))$。一旦发生拒绝，算法从归一化残差分布 $p'(x) = \frac{\max(0, p(x) - q(x))}{\beta}$ 中重采样。将接受与拒绝重采样两条路径的概率相加，输出任意词 $x$ 的边际概率为 $\min(q(x), p(x)) + \beta \cdot \frac{\max(0, p(x) - q(x))}{\beta} = \min(q(x), p(x)) + \max(0, p(x) - q(x)) = p(x)$，与目标模型原分布严格一致。
[^nsys]: **NVIDIA Nsight Systems（`nsys`）**：NVIDIA 官方提供的系统级性能分析工具，能够将 CPU 侧线程活动（Python 调用栈、CUDA API 调用）与 GPU 侧各 Stream 上每个 Kernel 的实际起止时间精确对齐到同一条时间线上，是排查 Kernel 启动空泡的首选工具。
[^ncu]: **NVIDIA Nsight Compute（`ncu`）**：NVIDIA 官方提供的核函数级剖析工具，用于深入采集单个 CUDA Kernel 内部的 Tensor Core 利用率、HBM 带宽占用率、寄存器分配数量与 SM 占用率，并直接生成对应的 Roofline 分析图。
[^continuous-batching]: **连续批处理（Continuous Batching）**：也称 Iteration-level Scheduling。推理引擎不再等待整批请求全部生成完毕才接纳新请求，而是在每一个 Decode 步结束后立即剔除已完成的请求并插入新到达的请求，从而保持高并发槽位利用率。
[^chunked-prefill]: **分块预填充（Chunked Prefill）**：当新到达请求的长提示词过长时，若一次性执行完整 Prefill 会阻塞同卡上正在进行的 Decode 请求。分块预填充将长提示词切分为若干固定大小的块，与正在解码的请求拼接在同一个批次中交替推进，以稳定 TPOT 延迟。
[^causal-mask]: **因果掩码（Causal Mask）**：在注意力矩阵计算中施加的下三角掩码，保证序列第 $i$ 个位置只能计算与 $1 \sim i$ 位置之间的注意力权重，屏蔽 $i$ 之后的所有未来位置，从而使并行输入的 $\gamma + 1$ 个位置互不干扰，与逐个串行输入得到完全一致的隐状态。
