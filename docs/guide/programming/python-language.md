---
title: Python 语言基础
description: 从一次模型调用读懂 Python 的参数传递、对象调用、装饰器、生成器与上下文管理器。
---

# Python 语言基础

在[第一次实验](../orientation/first-experiment.md)里，分词器准备好输入，模型生成回答，脚本再统计参数占用的字节数。先读下面两条语句。字典 `inputs` 里的值传给了谁？求和时，是哪一步开始逐个取参数？生成之后的统计还在 `with` 里面吗？

```python
with torch.inference_mode():
    output_ids = model.generate(**inputs, max_new_tokens=16)

parameter_bytes = sum(p.numel() * p.element_size() for p in model.parameters())
```

读完本章，你可以把这两条语句展开，按执行顺序解释给别人听。开头的模型片段用于阅读，后面的实验都可以用普通 Python 独立运行。准备一台普通 CPU 电脑和 Python 3（如 3.11），会使用列表、字典、`if` 和 `for` 即可，全程约 45～60 分钟。

在一个空目录中新建 `lesson.py`。每做一个实验，就用该节完整代码替换文件内容，先预测输出，再在同一目录执行 `python lesson.py`。如果你的系统使用 `python3` 命令，就执行 `python3 lesson.py`。

## 函数、参数与作用域 {#section-1}

### 函数如何接收模型输入

分词器通常把不同用途的数据放在不同字段里。这里用列表模拟一条补齐到三个位置的输入：`input_ids` 保存词元编号，`attention_mask` 用 1 标记有效位置、用 0 标记填充。我们先写一个函数，取出有效的编号。

```python
def select_tokens(input_ids, attention_mask, limit=2):
    selected = []
    for token, keep in zip(input_ids, attention_mask):
        if keep:
            selected.append(token)
    return selected[:limit]

inputs = {"input_ids": [42, 17, 0], "attention_mask": [1, 1, 0]}
print(select_tokens(inputs["input_ids"], inputs["attention_mask"]))
print(select_tokens(**inputs))
print(select_tokens(**inputs, limit=1))
print(select_tokens(**inputs, limit=3))
```

四行输出依次为 `[42, 17]`、`[42, 17]`、`[42]`、`[42, 17]`。第一行按位置传参，第二行的 `**inputs` 把字典展开成关键字参数（keyword arguments），相当于写 `select_tokens(input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"])`。前两次调用使用 `limit` 的默认值 2，第三次传入 1，只保留第一个有效词元。

第四次把上限放宽到 3，结果仍只有两个词元，因为第三个位置的掩码为 0，循环跳过了它。如果这一行输出 `[42, 17, 0]`，请检查 `selected.append(token)` 是否缩进在 `if keep:` 里面。

**函数外能用哪些名字？** 运行下面的完整示例。先预测两个 `print` 各会发生什么，再运行。

```python
def select_tokens(input_ids, attention_mask, limit=2):
    selected = []
    for token, keep in zip(input_ids, attention_mask):
        if keep:
            selected.append(token)
    return selected[:limit]

inputs = {"input_ids": [42, 17, 0], "attention_mask": [1, 1, 0]}
result = select_tokens(**inputs)
print(result)
print(selected)
```

函数通过切片 `selected[:limit]` 创建并返回一个新列表，所以 `print(result)` 输出 `[42, 17]`。第二个 `print` 抛出 `NameError`，因为 `selected` 是函数的局部变量，在文件顶层访问不到这个名字。

**如果字典键名拼错了呢？** 下面的完整示例把输入字段写成了 `mask`。运行它，看看 Python 指出哪个名字有问题。

```python
def select_tokens(input_ids, attention_mask, limit=2):
    selected = []
    for token, keep in zip(input_ids, attention_mask):
        if keep:
            selected.append(token)
    return selected[:limit]

inputs = {"input_ids": [42, 17, 0], "mask": [1, 1, 0]}
print(select_tokens(**inputs))
```

调用会抛出 `TypeError`，提示意外的关键字 `mask`。把字典里的键改成 `attention_mask` 再运行，应输出 `[42, 17]`。从报错回看函数定义，调用处展开后的键名必须能被函数接收。稍后在装饰器中，你会看到 `**` 出现在函数**定义**处，方向正好反过来。

## 类、继承与特殊方法 {#section-2}

### 从模型实例找到 forward

读模型定义时，经常能找到 `forward`，调用处却写着 `model(...)`。先用两个普通的 Python 类重现这个调用关系。运行前猜一下：下面两个 `print` 各会输出几行？

```python
class Module:
    def __call__(self, value):
        print("进入调用入口")
        return self.forward(value)

    def forward(self, value):
        raise NotImplementedError("请在子类中实现前向计算")

class Doubler(Module):
    def forward(self, value):
        print("执行前向计算")
        return value * 2

model = Doubler()
print(model(3))
print(model.forward(3))
```

```text
进入调用入口
执行前向计算
6
执行前向计算
6
```

子类 `Doubler` 继承了父类的[特殊方法（special method）](https://docs.python.org/zh-cn/3/reference/datamodel.html#special-method-names) `__call__`，因此其实例可以像函数一样被调用。父类的 `forward` 只负责提示子类提供实现；`Doubler` 重写了这个方法。执行 `model(3)` 时，`self` 指向 `Doubler` 实例，所以 `self.forward(3)` 会找到执行乘法的版本。直接调用 `model.forward(3)` 则从“执行前向计算”开始。

这是简化的调用关系。在 PyTorch 中，自定义 `nn.Module` 通常通过重写（override）`forward` 定义前向计算，外部通过 `model(...)` 调用，模块入口还能处理已注册的前向钩子（hook）。开头的 `model.generate(...)` 显式选中了生成方法，它负责组织生成过程；阅读代码时先认清这一行调用的入口。

**延伸阅读**：想知道哪些操作会触发 `__call__`、`__iter__` 等特殊方法，可以按名称查阅 [Python 语言参考《特殊方法名称》](https://docs.python.org/zh-cn/3/reference/datamodel.html#special-method-names)。

## 装饰器与闭包 {#section-3}

### 装饰器如何包住一次调用

假如想在每次生成回答前后记录一次消息，可以把原函数交给另一个函数，让它返回一个带记录功能的新函数。运行下面的例子时，留意“进入”出现在哪一步，以及原函数的结果能否传回调用者。

```python
def trace(func):
    def wrapped(*args, **kwargs):
        print("进入", func.__name__)
        result = func(*args, **kwargs)
        print("退出", func.__name__)
        return result
    return wrapped

def count_tokens(tokens):
    return len(tokens)

count_tokens = trace(count_tokens)
print(count_tokens([42, 17]))
```

```text
进入 count_tokens
退出 count_tokens
2
```

执行赋值时，`trace` 返回 `wrapped` 函数。直到最后一行调用它，第一条消息才打印出来。第一节中，在文件顶层读取 `selected` 会报错。这里 `trace` 已经返回，为什么 `wrapped` 还能调用 `func`？看两个 `def` 的缩进：`wrapped` 定义在 `trace` 内部，它使用的 `func` 是外层函数的参数。返回的函数保留了对这个外层绑定的访问，这就是闭包（closure）。

`wrapped` 用 `*args, **kwargs` 接收调用者给的参数，再原样传给 `func`。这里传入的只有列表 `[42, 17]`，所以原函数数出两个词元。

### 用 @trace 装饰函数

Python 中使用装饰器（decorator）的常见写法，是把 `@装饰器名` 放在函数定义的正上方。把下面的完整示例保存为 `lesson.py`，运行 `python lesson.py`。

```python
def trace(func):
    def wrapped(*args, **kwargs):
        print("进入", func.__name__)
        result = func(*args, **kwargs)
        print("退出", func.__name__)
        return result
    return wrapped

@trace
def count_tokens(tokens):
    return len(tokens)

print(count_tokens([42, 17]))
```

这里的 `@trace` 等价于前例在函数定义后写的 `count_tokens = trace(count_tokens)`。执行到函数定义时，Python 就把刚创建的函数交给 `trace`，并将返回的 `wrapped` 绑定到名字 `count_tokens`。直到最后一行调用 `count_tokens([42, 17])`，才会依次看到 `进入 count_tokens`、`退出 count_tokens` 和 `2`。

**试着去掉返回值。** 删掉 `wrapped` 里的 `return result`，再运行。最后一行会变成 `None`：原函数算出了 2，但包装函数没有把它返回给调用者。观察到 `None` 后，把 `return result` 加回原处。

## 迭代器、生成器与上下文管理器 {#section-4}

### 生成器何时交出下一个值

模型可能有许多参数张量。统计总大小只需逐项累加，每次拿到一个张量即可。下面用两组参数模拟这个过程，一组有 3 个元素、每个占 4 字节，另一组有 2 个元素、每个占 2 字节。

```python
def parameter_sizes():
    for count, width in [(3, 4), (2, 2)]:
        size = count * width
        print("交出", size)
        yield size

sizes = iter(parameter_sizes())
print("已创建")
print("首项", next(sizes))
print("余项之和", sum(sizes))
print("再次求和", sum(sizes))
```

```text
已创建
交出 12
首项 12
交出 4
余项之和 4
再次求和 0
```

含 `yield` 的函数在调用时返回生成器（generator）。它本身就是迭代器（iterator），对它调用 `iter` 得到它自己。第一次 `next` 才执行函数体，遇到 `yield` 就交出当前值并暂停。之后 `sum` 从暂停处继续取值，一直取到耗尽。最后一次求和面对的是空序列。相比之下，列表是可迭代对象（iterable），每次对同一列表调用 `iter` 都可以得到从头开始的新迭代器。

**再算一次总量。** 在末尾追加 `print(sum(parameter_sizes()))`。前两条“交出”消息会再次出现，最后得到 16。回看开头的 `sum(... for p in model.parameters())`：括号里的生成器表达式（generator expression）逐个产生字节数。`p.numel()` 是当前张量的元素个数，`p.element_size()` 是每个元素占的字节数。求和时才逐项计算，无需先保存一份大小列表。

### with 管理哪一段代码

写 `with open(...) as f:` 读文件时，离开缩进块就会关闭文件。实现进入和退出动作的对象叫上下文管理器（context manager）。用一个能打印这两个动作的对象，就可以看到动作发生的准确位置。

```python
class Scope:
    def __enter__(self):
        print("进入区块")
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        print("退出区块")

with Scope():
    print("调用模型")
print("统计参数")
```

```text
进入区块
调用模型
退出区块
统计参数
```

把最后一行缩进到 `with` 内，再运行一次。“统计参数”会移到“退出区块”之前。进入代码块前，Python 调用 `__enter__`；离开时调用 `__exit__`。即使块内抛出异常，退出方法也会收到异常信息，有机会清理资源。

在开头的模型代码里，`torch.inference_mode()` 提供上下文管理器。缩进内的生成调用在推理模式下执行，退出时恢复先前的模式。

## 小结

1. **参数与作用域。** 读到 `generate(**inputs)`，字典的每个键都会成为一个关键字参数的名称；顺着调用过程，可以看出这些参数由哪一层接收。函数里的局部变量只在相应作用域内可见，调用者可以通过返回值取得计算结果。
2. **类与方法。** 读到 `model(...)`，从实例的 `__call__` 入口追踪到具体模型的 `forward`；读到 `model.generate(...)`，则从命名的生成方法开始读。
3. **装饰器与闭包。** 在本章的 `@trace` 示例里，函数定义时就完成了包装。调用时，包装函数通过闭包访问原函数，在调用前后打印消息，并传回结果。
4. **迭代与上下文。** 回看开头的推理片段，`with` 的缩进标出了推理模式生效的范围。退出这个范围后，`sum` 才开始逐个取出参数张量，累加每个张量占用的字节数。

## 延伸阅读

- 阅读推理脚本时，遇到 `*args` 或 `**inputs` 可以查参数展开的示例。[Python 教程：解包参数列表](https://docs.python.org/zh-cn/3/tutorial/controlflow.html#unpacking-argument-lists)
- 掌握单个 `@trace` 后，可以继续看多个装饰器的应用顺序，以及它们对应的嵌套调用。[Python 语言参考：函数定义](https://docs.python.org/zh-cn/3/reference/compound_stmts.html#function-definitions)
- 开始阅读模型子类时，可以对照官方对 `forward` 的说明，了解直接调用它会跳过哪些钩子。[PyTorch：Module.forward](https://docs.pytorch.org/docs/stable/generated/torch.nn.Module.html#torch.nn.Module.forward)
- 想继续理解惰性求值，可以跟着 `yield` 示例观察函数从哪里恢复执行，再读紧接着的生成器表达式一节。[Python 教程：生成器](https://docs.python.org/zh-cn/3/tutorial/classes.html#generators)
