---
title: 第一次实验
description: 用 CPU 加载一个小模型，估算参数大小，再测量加载耗时和进程内存。
---

# 第一次实验：算一遍权重，再把模型跑起来

一个叫「135M」的模型，下载时权重文件大约 257 MiB，用 FP32 加载后参数占 513 MiB，生成一句话时 Python 进程却占了将近 1 GiB。这三个数可以同时成立。在这篇实验里，你会亲手得到它们，找出各自量的是哪一样东西，最后留下一份别人也能复跑的记录。

只需要会在终端运行 Python 脚本。下面用 **Windows PowerShell、conda 和 CPU**，普通笔记本即可。参考机器是 Windows 11、i7-14650HX、32 GB 内存，PyTorch 使用 4 个 CPU 计算线程。模型文件合计约 271 MB，还需下载 Python 依赖。环境就绪后，给第一次动手和对照输出留 20～30 分钟。

## 环境准备与版本检查 {#section-1}

### 让下载、加载和生成分三步发生

第一次运行一条推理命令，有时要等好几分钟。时间花在下载模型、把权重读入内存，还是让模型生成回答？如果把三件事塞进同一个计时器，拿到一个总数也回答不了。我们先把文件准备到本地，后面只给加载模型的那几行计时。

下载[本章实验脚本](/examples/first-experiment/first-experiment.zip)，解压到一个空文件夹。在这个文件夹打开已配置 conda 的 PowerShell。实验用 `first_experiment.py` 做推理，用 `weigh_model.py` 对照两种加载精度。首次准备环境时执行：

```powershell
conda create -n first-lab python=3.11 -y
conda activate first-lab
python -m pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install transformers==5.15.0 psutil==7.2.2 modelscope-hub==0.7.1
```

先做一个小检查。下面的命令会真正导入这次要用的库，也会打印运行它们的解释器路径。如果命令行提示安装成功，运行时却找不到包，先看这条路径是否位于刚建的 `first-lab` 环境里。

```powershell
python -c "import sys, torch, transformers, psutil; print(sys.executable); print(torch.__version__, transformers.__version__, psutil.__version__)"
```

本次复跑的版本输出是 `2.13.0+cpu 5.15.0 7.2.2`。其中 `+cpu` 就是这次选择的 PyTorch 构建版本。

### 固定模型版本，检查权重文件

同一个模型名可以对应多个修订版本。这里固定 SmolLM2-135M-Instruct 的一个快照，让你拿到和示例相同的配置、分词器和权重。在同一个 PowerShell 窗口执行：

```powershell
$model = 'HuggingFaceTB/SmolLM2-135M-Instruct'
$rev = 'c134cb42e51e0d1f29041149173377c623c99b25'
$files = 'config.json', 'generation_config.json', 'model.safetensors',
         'special_tokens_map.json', 'tokenizer.json', 'tokenizer_config.json'
ms-hub download $model @files --revision $rev --local-dir weights
```

`config.json` 描述网络结构，`model.safetensors` 保存权重张量，`tokenizer` 相关文件决定怎样把提问变成 token。脚本会从当前目录下的 `weights` 查找这些文件。先看一眼权重文件本身：

```powershell
(Get-Item ./weights/model.safetensors).Length
```

这个版本应得到 **269060552 字节**，约 256.60 MiB。把数字记下来。六个文件都已与 Hugging Face 修订版本 `12fd25f77366fa6b3b4b768ec3050bf629380bac` 逐个核对过。下一步只需读本地文件。

## 参数量到字节数的换算 {#section-2}

### 从一张能数清楚的表开始

如果做过[第一张工单](../first-lab.md)，你已经用过「参数个数 × 每个参数的字节数」。这里先拿模型中的一块真实权重试算。

模型读入一个 token 时，会从输入嵌入表（embedding table）查出对应的一行数。这个模型的表有 **49,152 行、每行 576 个数**。所以光是这张表就有 `49,152 × 576 = 28,311,552` 个参数。按每个数占 2 字节算，整张表恰好是 **54 MiB**；把相同的数以 4 字节存放，就是 **108 MiB**。行数、列数都没有变。

### 把单位写进算式

这里用的 1 MiB 等于 1,048,576 字节，也就是 1024² 字节。模型名中的「135M」表示参数个数的近似值。实际统计得到 **134,515,008 个参数**。对照下面的结果，你能看出在哪一步才开始引入存储单位。

```powershell
python -c "n = 134_515_008; print(n * 4, 'bytes'); print(n * 4 / 1024**2, 'MiB')"
```

```text
538060032 bytes
513.134033203125 MiB
```

这就是 FP32 权重的预测值。若用十进制的 MB 表示，同样的 538,060,032 字节约为 538.06 MB。别人报告「538 MB」，你报告「513 MiB」，这两个结果完全可以指向同一组字节。交换实验记录时，保留字节数最容易核对。

## 三种精度下的权重占用估算 {#section-3}

先做个预测：参数个数不变，从 32 bit 改成 16 bit，哪些值会减半？改成 4 bit 呢？一个字节有 8 bit，把每个参数的位数除以 8，就能沿用上一节的算式。

| 表示方式 | 每个参数 | 134,515,008 个参数的理论大小 | 本章怎样核对 |
| --- | ---: | ---: | --- |
| FP32 | 4 字节 | 513.13 MiB | 加载并统计张量，随后实际推理 |
| BF16 / FP16 | 2 字节 | 256.57 MiB | 加载并统计 BF16 张量 |
| 4-bit 理想打包 | 0.5 字节 | 64.14 MiB | 纸笔估算，每字节打包两个值 |

BF16 和 FP16 对单个数都使用 16 bit，能表示的数值范围和精度有所区别。表格只回答存储占用。4-bit 一行只计参数值，量化实现还可能保存每组的缩放系数等元数据。直接拿 64.14 MiB 当成运行时内存预算，会漏掉这些数据以及执行推理所需的空间。

### 用同一份权重验证两行预测

在实验目录运行第二个脚本。它只在 CPU 上加载权重，先后指定 BF16 和 FP32，两次都读取同一份文件。这个对照不用生成文本。

```powershell
python weigh_model.py
```

```text
torch.bfloat16 (49152, 576) 134515008 256.57 MiB
torch.float32 (49152, 576) 134515008 513.13 MiB
```

输出从左到右是输入嵌入表的数据类型、形状、全模型参数数目，以及全部参数张量的大小。关键计算只有两行，打开 `weigh_model.py` 就能找到：

```python
count = sum(p.numel() for p in model.parameters())
size = sum(p.numel() * p.element_size() for p in model.parameters())
```

`numel()` 数一个张量有多少个元素，`element_size()` 给出每个元素占多少字节。先对每个张量求字节数再求和，即便不同张量采用不同精度，这个计算仍能逐项反映差别。现在再看开头记下的文件大小：文件里的张量以 BF16 保存，文件本身还带有张量名称、形状等头部信息。所以磁盘上的 **256.60 MiB** 与参数值的 **256.57 MiB** 接近，而当你要求加载为 FP32 时，进程里的参数张量确实要占 **513.13 MiB**。

## 小模型加载与耗时记录 {#section-4}

### 先运行一次，再回头看测量点

```powershell
python first_experiment.py --json my-run.json
```

这次会多做一件事：让模型回答 “What is the capital of France?”。在终端里找一下加载耗时、三行 `Process RSS` 和最后的 `Reply`。下面是一次真实运行的截图，Notebook 调起了独立的 Python 进程。你直接在 PowerShell 里运行，也可以对照同样的输出字段。[查看可复制的输出](/examples/first-experiment/notebook-output.txt)

![示例运行显示 513.13 MiB 的 FP32 参数、1.086 秒的加载耗时、三次进程内存读数和模型回答](/images/first-experiment/notebook-run.png)

### 计时器放在哪里？

分词器（tokenizer）先把提问和对话格式转成模型输入。脚本完成这一步之后，才读取基线并启动计时器。下面是 `first_experiment.py` 中负责加载的代码，可以在原文件里逐行对照：

```python
before = process.memory_info().rss
start = perf_counter()
model = AutoModelForCausalLM.from_pretrained(
    args.model, dtype=torch.float32, local_files_only=True,
)
load_seconds = perf_counter() - start
loaded = process.memory_info().rss
```

`perf_counter()` 两次读数之差给出这次加载经过的秒数。这个范围包含从本地文件初始化模型、把参数准备成 FP32 的工作。Python 启动、下载文件、准备输入和生成答案都在这个区间外。脚本连续启动两次，即使文件相同，操作系统的文件缓存和当时的系统负载也可能影响时间；一次读数不足以比较两台机器的性能。

接下来模型用 `generate` 生成最多 16 个新 token。函数返回后，脚本取第三个内存读数，再从输出里切掉原始输入那部分，解码新生成的回答。这次输入共有 **37 个 token**，其中包括对话模板；模型在上限之前就生成了结束标记，因此实际记录了 **8 个新 token**。这里量到的加载耗时不能拿来计算每秒生成多少 token，后者需要单独给生成过程计时。

## 结果校验与偏差排查 {#section-5}

### 先算增量，再解释差额

进程常驻内存（RSS，resident set size）反映进程在采样时占用的驻留物理内存。Windows 上这里读到的是 Python 进程的工作集。下图的三根柱子来自同一次运行：

![同一 Python 进程在加载前、加载后和生成结束时分别占 437.58、961.03 和 968.59 MiB](/images/first-experiment/process-rss.png)

直接拿 **961.03 MiB** 和 **513.13 MiB** 比较，会把加载前已经存在的 Python 解释器、导入的库、分词器和输入都算进来。先做一次减法：`961.03 − 437.58 = 523.45 MiB`。这个增量比参数张量的理论大小多约 **10.32 MiB**。我们量到了这段时间内整个进程的净变化，三个采样点无法告诉我们这 10.32 MiB 分别属于哪些对象。

再看第三个数。生成结束时比加载后多了约 **7.57 MiB**（用 JSON 中未舍入的字节计算）。生成途中申请又释放的空间，可能不会留在这个读数里。所以这三次快照无法给出整段推理的峰值，也无法从这 7.57 MiB 单独推出注意力键值缓存（KV cache）的大小。

### 自己的结果和图不一样，先查什么？

| 你观察到的现象 | 先检查哪一项 | 可以从中判断什么 |
| --- | --- | --- |
| 找不到模型或分词器文件 | 在解压目录运行 `Test-Path ./weights/model.safetensors` 和 `Test-Path ./weights/tokenizer.json` | 两项均应为 `True`。若有 `False`，核对下载是否完成，以及终端当前目录是否正确 |
| 程序能跑，参数数目与 134,515,008 不同 | 核对下载用的模型名和修订版本，再运行 `python weigh_model.py` | 先确认正在比较同一份模型，再讨论精度和系统内存 |
| 参数数目相同，张量大小约 256.57 MiB | 看 `weigh_model.py` 对应行打印的 dtype，以及主脚本的 `dtype=torch.float32` | 16-bit 与 32-bit 各有自己的理论值 |
| 参数字节数完全一致，加载后的总内存却差了一百多 MiB | 同时查看自己的 `before_load` 和 `after_load`，用原始字节相减 | 两个进程可以从不同基线开始。把两次的加载增量放在一起更容易比较 |

最后一行在这次验收中就出现过。在另一套干净环境里，加载后只有 **852.08 MiB**，比图上的 **961.03 MiB** 少了约 109 MiB；它在加载前就只有 **327.70 MiB**。重新相减，两次的加载增量分别为 **524.38 MiB** 和 **523.45 MiB**。我们有证据说明基线不同，但现有数据不能把基线差异归因到某个包或某个 Python 补丁版本。[对照这次干净环境的原始记录](/examples/first-experiment/clean-run.json)

## 实验记录整理 {#section-6}

### 让别人能核对你的计算

保留刚才的 `my-run.json`。它有四类值得一同记录的信息：运行环境（Python、PyTorch、CPU 线程数），加载条件（设备和精度），固定量（参数个数和字节数），以及观测量（耗时、三个 RSS、新 token 数）。把模型名和修订号也抄在这份记录旁；脚本的 JSON 只自动记录模型架构类型。这样同伴拿到结果，第一步就能判断你们比较的是不是同一个实验。

可以直接让 PowerShell 用你的 JSON 算一次，再把结果与图对照。`1MB` 在 PowerShell 数值表达式里等于 1,048,576，这里对应 MiB。

```powershell
$r = Get-Content ./my-run.json -Raw | ConvertFrom-Json
$r.parameter_bytes
[math]::Round(($r.rss_bytes.after_load - $r.rss_bytes.before_load) / 1MB, 2)
```

### 只改生成长度，检验你的解释

复制一份主脚本，在副本里把 `max_new_tokens=16` 改成 `max_new_tokens=4`，保持模型、提问和精度相同。先猜：文件大小、参数张量、回答长度、进程内存，这四项里哪些应当保持不变？运行后把两份结果并排读：

```powershell
Copy-Item ./first_experiment.py ./four_tokens.py
```

保存对 `four_tokens.py` 的那一处修改，然后执行：

```powershell
python four_tokens.py --json four-tokens.json
Get-Content ./my-run.json, ./four-tokens.json -Raw |
    ForEach-Object { $_ | ConvertFrom-Json } |
    Format-Table parameter_bytes, input_tokens, new_tokens, reply
```

| 干净环境中的两次运行 | 参数字节数 | 输入 token | 新 token | 解码后的回答 |
| --- | ---: | ---: | ---: | --- |
| 生成上限 16 | 538,060,032 | 37 | 8 | The capital of France is Paris. |
| 生成上限 4 | 538,060,032 | 37 | 4 | The capital of France |

两次都用同一份模型文件，同样数量的 FP32 参数。缩短回答改变了生成过程，不能据此预测进程工作集也会按同样比例缩小。[查看 4-token 实验记录](/examples/first-experiment/four-tokens.json)

到这里，你可以给同伴留一句能复核的结论：「我用同一版本的模型，在 CPU 上按 FP32 加载；参数占 ___ MiB，加载前后的进程内存增加 ___ MiB。把生成上限改为 4 后，___ 保持不变，___ 发生了变化。」前两个空从你自己的 JSON 计算，后两个空用两次运行来回答。

想改提问或对话格式时，可照着[模型卡的示例](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)改。若想继续追查不同系统如何统计 RSS，再读 [psutil 的进程内存说明](https://psutil.readthedocs.io/en/latest/#psutil.Process.memory_info)。
