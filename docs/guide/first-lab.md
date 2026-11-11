# 第一张工单：估算模型权重大小

设想你准备在一台电脑上加载一个 70 亿参数的模型。先回答一个部署前的问题。只把权重读入内存，大约要预留多少空间？

## 运行计算

需要 Python 3。把下面的代码保存为 `estimate_weights.py`，再运行 `python estimate_weights.py`。如果系统把 Python 3 命名为 `python3`，运行 `python3 estimate_weights.py`。

```python
parameters = 7_000_000_000
gibibyte = 1024 ** 3

for label, bits_per_parameter in [("FP32", 32), ("FP16", 16), ("4-bit", 4)]:
    weight_bytes = parameters * bits_per_parameter / 8
    print(f"{label:>5}  {weight_bytes / gibibyte:5.2f} GiB")
```

预期输出如下。

```text
 FP32  26.08 GiB
 FP16  13.04 GiB
4-bit   3.26 GiB
```

## 读懂数字

权重的理论大小等于参数量乘以每个参数的字节数。70 亿个 FP16 参数需要 140 亿字节，约为 13.04 GiB。这里的 GiB 以 1024 为进位，产品标称容量里的 GB 通常以 1000 为进位。

真实推理还要为 KV cache、激活、临时缓冲区和运行时预留空间。量化模型也可能为量化比例等元数据占用额外空间。把上面的结果当作权重这一项的估算，再根据部署配置评估总占用。

## 试着改一个参数

把 `parameters` 改成 `14_000_000_000`。在运行前先猜 FP16 的结果，再验证。之后回到[学习路线](./)，看看怎样用一次实际推理继续观察模型的运行成本。
