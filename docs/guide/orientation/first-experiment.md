---
title: 第一次实验
description: 用 CPU 加载一个小模型，估算参数大小，再测量加载耗时和进程内存。
---

# 第一次实验：算一遍权重，再把模型跑起来

一个约 1.35 亿参数的模型，按每个参数 4 字节算，大约占半个 GiB。把它加载到电脑上，Python 进程会多占多少内存？先在纸上写个猜测。等模型回完第一句话，再回来对答案。

你需要会运行 Python 脚本。下面按 Windows PowerShell 和 conda 环境演示，实验用 CPU，有集成显卡的笔记本也能跟着做。模型文件合计约 271 MB，首次安装 Python 和 PyTorch 还需要额外下载。环境和模型就绪后，可以留十分钟边跑边看。本文示例来自 Windows 11、i7-14650HX、32 GB 内存的电脑，使用 4 个 CPU 计算线程。

## 先算一遍

[第一张工单](../first-lab.md)用 70 亿参数练习了权重估算。这次换一个普通笔记本也能跑的模型 SmolLM2-135M-Instruct。“135M”是取整后的名字，这个版本实际有 134,515,008 个参数。每个 FP32 参数占 4 字节，换成 MiB 要除以 1024²。

```python
>>> 134_515_008 * 4 / 1024**2
513.134033203125
```

| 每个参数的存储精度 | 每个参数的字节数 | 权重理论大小 |
| --- | ---: | ---: |
| FP32 | 4 | 513.13 MiB |
| BF16 或 FP16 | 2 | 256.57 MiB |
| 4-bit 理想打包 | 0.5 | 64.14 MiB |

最后一行只计算打包后的参数值。量化时保存的缩放系数等信息还要占空间。本次实测用 FP32，其余两行供估算。

## 把下载和计时分开

下载[实验脚本（ZIP）](/examples/first-experiment/first-experiment.zip)，将里面的 `first_experiment.py` 解压到空文件夹，在这个文件夹打开已配置 conda 的 PowerShell。先创建环境，再安装 CPU 版 PyTorch 和读取内存所需的依赖。截图使用 Python 3.11.15、PyTorch 2.13.0+cpu、Transformers 5.15.0、psutil 7.2.2。

```text
conda create -n first-lab python=3.11 -y
conda activate first-lab
python -m pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install transformers==5.15.0 psutil==7.2.2
python -m pip show torch transformers psutil | Select-String '^(Name|Version):'
```

用 ModelScope 的下载工具获取模型，为本次实验固定一个版本。下面 6 个文件已与 Hugging Face 原始版本 `12fd25f77366fa6b3b4b768ec3050bf629380bac` 逐个核对过，内容一致。在同一个 PowerShell 窗口执行这一整段，脚本旁边会出现 `weights` 文件夹。

```text
python -m pip install modelscope-hub==0.7.1
$model = 'HuggingFaceTB/SmolLM2-135M-Instruct'
$rev = 'c134cb42e51e0d1f29041149173377c623c99b25'
$files = 'config.json', 'generation_config.json', 'model.safetensors',
         'special_tokens_map.json', 'tokenizer.json', 'tokenizer_config.json'
ms-hub download $model @files --revision $rev --local-dir weights
```

这里有个容易错过的细节。下载的文件以 BF16 保存权重，脚本用 `dtype=torch.float32` 把参数加载到 CPU。同一组参数在文件里用 2 字节表示，加载后用 4 字节表示。先把这两个精度对齐，再拿文件大小来比较。

## 跑一次，读三个数

```text
python first_experiment.py --json my-run.json
```

脚本先准备好分词器（tokenizer）和输入，记录**加载模型前**的内存。接着给 `from_pretrained` 单独计时，等它返回时记录**加载模型后**的内存。最后让模型回答一个问题，等 `generate` 返回再记录**生成结束后**的内存。Windows 下读的是当前 Python 进程的工作集（working set），由 `psutil.Process().memory_info().rss` 取得。三个数都是那个时刻的读数；中间的瞬时峰值需要另外采样。

![已执行的 Jupyter 单元格展示运行命令、513.13 MiB 的参数张量、三次进程内存读数和模型生成的回答](/images/first-experiment/notebook-run.png)

图里是从 Notebook 启动的独立 Python 进程。它把提问编码成 37 个输入 token，生成 8 个新 token（含结束标记），解码得到 “The capital of France is Paris.”。先在你的输出里找三样东西：CPU / FP32、134,515,008 个参数，以及模型新生成的文本。[本次可复制的输出](/examples/first-experiment/notebook-output.txt)。

## 哪个数适合拿来和 513.13 MiB 比？

![柱状图展示同一次运行的进程内存。加载前 437.58 MiB，加载后 961.03 MiB，生成结束后 968.59 MiB](/images/first-experiment/process-rss.png)

先看第一根柱子。权重还没加载，进程已经占了 **437.58 MiB**，其中包括 Python、已导入的库和准备好的输入。加载后读到 **961.03 MiB**，相减得到 **523.45 MiB**。这才是在这一段里实际观察到的增量。

脚本还逐个统计了参数张量的元素数和每个元素的字节数，加起来是 **513.13 MiB**，正好与 FP32 估算相符。进程增量比它多 **10.32 MiB**。这次测量只能把这部分定位在加载阶段，无法再分到某个具体对象上。同理，生成结束后的读数增加了约 **7.57 MiB**，仅凭前后两个时刻的差值也算不出 KV cache 的大小。

在新的 Python 进程中复跑，两次加载分别用了 **1.086 秒**和 **1.089 秒**，统计出来的参数字节数完全一致。你复跑时也可以这样检查。参数数目或张量字节数对不上，先核对模型版本和加载精度。只有耗时或进程内存变化时，保留自己的结果，顺手记下机器和软件版本。[图中这次的记录](/examples/first-experiment/run.json) · [独立复跑记录](/examples/first-experiment/repeat.json)

## 留一个自己能验证的问题

在脚本里找到 `max_new_tokens=16`，改成 `4`，再运行 `python first_experiment.py --json four-tokens.json`。先猜哪一项一定保持不变。跑完对比两个 JSON 里的 `parameter_bytes` 和 `new_tokens`：同一组权重可以生成不同长度的回答，后一次最多生成 4 个新 token。

想换一句提问时，可以看[模型卡里的对话示例](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)。想知道操作系统究竟把哪些内存算进了 RSS，可以再读 [psutil 的进程内存说明](https://psutil.readthedocs.io/en/latest/#psutil.Process.memory_info)。
