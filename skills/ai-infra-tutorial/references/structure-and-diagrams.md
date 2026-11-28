# 教学结构、双层折叠与矢量配图规范

教学文章的骨架决定读者能不能顺着一条清晰的依赖链走完整个技术机制。这份文件规定教学文章的板块配重、双层折叠边界，以及**主动配图与边框渲染核查**要求。

## 一、教学文章参考骨架

参考站点成稿《大模型概览》（`docs/guide/orientation/llm-overview.md`）与维度拆解结构，典型教学文章采用如下骨架（H2 板块保持 4–8 个，技术类 H2 按「原理/简介 $\to$ 典型方式/机制 $\to$ 应用/边界」拆出 H3，并列方法可下沉 H4）：

```markdown
# <核心主题>

（导语 150–250 字：为什么 AI Infra 视角需要懂它 → 学完建立什么判断力 → 通用理论贯穿示例；严禁在此出现测试卡型号与本地版本号）

## <问题诊断 / 核心定义>
（引导段 1–3 句：制造表象对比并提出核心问题，引出下方小节）
### <对比维度 / 核心指标>
### <另一维度瓶颈>

## <核心技术一>
（引导段 1–3 句：承接上文瓶颈，引出这项技术解决什么矛盾）
### <技术一>原理
### 典型<技术一>方式
#### <子方法 A>
#### <子方法 B>
### <技术一>的工程边界

## 入门动手实战（原理概述/导论文章可省略）
（引导段 1–2 句：说明本节实操验证的目标与前置基础假设）
### 环境搭建
### 脚本编写
### 性能对比分析

## 小结
## 延伸阅读
```

| 板块 | 写什么 | 不写什么 |
|---|---|---|
| 导语 | 为什么工程系统在乎它、读完建立什么心智模型、通用理论示例 | 空泛赞美、百科式历史回溯、**测试卡型号及本地环境版本号** |
| 问题诊断与定义 | 术语精确定义（英文全称+缩写）、边界条件、一个最小直观例子 | 堆砌一串不展开的名词列表、H2 与首个 H3 之间缺少引导段 |
| 核心技术模块 | 按「原理/简介 $\to$ 典型方法（可拆 H4） $\to$ 应用与边界」拆解、矢量图、核心结论式 | 把原理、方法、作用揉进同一小节或长句标题；主干塞满长推导 |
| 入门动手实战 | 环境搭建（含框架安装）、脚本编写（独立语言块）、对照运行、实测环境说明、关键原始输出与结果分析 | `cat << 'EOF'` 写文件、多步骤挤一块、暴露作者私有路径、标题写测试卡型号 |
| 小结 | 收束全篇建立的 3–4 条因果关系，点明如何衔接到下一个系统专题 | 逐句复读各小节第一句话 |
| 延伸阅读 | 原论文、官方文档、源码仓库、经核对的权威课程章节 | 未经核对的二手博客 |

## 二、实战章节与「命令 + 输出」穿插规范

### 1. 「命令/源码 + 原始输出」拓展内容硬要求

无论是正文主干还是 `::: details 点击展开：...` 折叠框内，只要穿插了「命令/源码 + 原始输出」：

1. **命令与源码必须加注释**：在代码块内部用行内注释写清关键 flag、参数含义、常见坑点或底层动作，不能只贴一坨光秃秃的命令。
2. **原始输出允许截断但必须真实有焦距**：若终端输出较长，用 `...` 省略重复或无关的启动刷屏日志，只保留能直接印证结论的关键行（注意：严禁篡改或虚构实测数值）。
3. **必须附带注释与执行结果分析**：输出代码块之后必须紧跟条目式分析，明确指出「输出里的哪一行、哪几个指标说明了什么机制」，与前文原理形成闭环。

### 2. 文末「入门动手实战」章节八条准则

除纯粹的全局原理概述/导论文章（如《大模型概览》《AI Infra 概览》《分布式并行概览》）外，其余每篇文章在 `## 小结` 之前都要加一个实战章节：

1. **只默认基础 CUDA 与 Python 环境，框架/代码库必须独立给安装步骤**：不得把 `vllm`、`sglang`、`flashinfer` 等推理框架或开源代码库当作已预装环境略过。必须把创建隔离环境、安装目标库（或 `git clone` 并安装依赖）写成独立的前置步骤并给出完整命令。
2. **一个步骤一个代码块，每步下方必写要点与解释**：禁止把新建目录、安装依赖、编写源码、运行压测全部挤在同一个大代码块里。每个独立操作单列一个代码块，并在该代码块紧后方用文字或要点列表解释关键参数、底层作用与注意事项（篇幅随该步难易和重要程度调整）。
3. **编写文件禁绝 `cat << 'EOF'`，改用新建文件 + 独立语言代码块**：禁止在 `bash` 块内使用 `cat << 'EOF' > xxx.py` 生成源码文件。应先提示读者新建工作目录并创建目标文件（如 `bench_exec_modes.py`），再单独使用对应语言的围栏代码块（如 ```` ```python ````）给出完整带注释源码，方便读者直接阅读高亮与复制。
4. **严禁暴露作者私有路径，使用通用草拟路径并提示替换**：禁止出现作者本机或远端实验机的真实私有路径（如 `/home/<username>/...`、`C:\Users\<username>\...` 或特定内网地址/端口）。所有需要读者按自身环境修改的目录（如模型权重路径、虚拟环境目录、CUDA 工具链路径），一律写成通用草拟路径（如 `/path/to/models/Qwen3-0.6B`、`~/venvs/vllm-env`）并显式提示读者修改。
5. **标题中禁止出现测试显卡型号，面向通用 GPU 写作**：H1/H2/H3 与折叠框标题中严禁出现 `RTX 5070`、`A100` 等特定测试显卡型号。仅在交代基准实测环境或对照表格条件栏时客观说明“以下实测数据采集自某型 GPU”，所有操作步骤和命令必须面向通用 NVIDIA GPU 读者。
6. **必须展示关键原始输出**：实测后展示关键原始终端输出；篇幅过长时用 `...` 省略冗余行，只保留关键行与关键指标。（若无可用 GPU 导致无法实跑，按 `references/sources-and-lab.md` 降级规则诚实标明「预期输出格式示例，待实机运行验证」，不把未跑结果冒充实测成绩。）
7. **执行结果分析不能少**：紧跟原始输出拆解关键字段含义、与理论估算的对应关系，以及出现常见报错或数值异常时的排查方向。
8. **选题边界（用户优先 + 入门轻量）**：若用户明确指定了实战内容，**严格按用户指定内容编写**；若用户未指定，则由写作模型自主挑选最贴合前文核心机制的轻量实战，定位为初学该章节读者的入门体验——**不讲太深、不过多牵扯前文未介绍的额外知识**。

## 三、贯穿示例原则

尽量用**同一个最小例子**从头穿到尾，避免每换一节就换一套示例导致读者重新建立上下文：

- 写 Tokenizer：用同一句中英文对比 BPE 切分、Token 数膨胀与 KV Cache 倍率。
- 写 KV Cache：用同一个 7B/8B 模型的层数、KV 头数、头维度和序列长度，先手算理论显存，再用 PyTorch/推理引擎实测对比。
- 写 CUDA/Triton 算子：用同一个向量加法或归约（Reduction）示例，从索引计算写到 shared memory tiling 与带宽瓶颈分析。

## 四、双层阅读结构（主干极简成文 + 折叠深读）

### 1. 主干与折叠的硬边界

- **主干层（默认展示，必须独立成文）**：
  - 每节包含：**1 句粗体断言句（单独成段）** + 清晰的定义/动作步骤 + 矢量图或关键对照表 + 最多 1 个核心结论公式 + 系统影响与 `<mark>` 暖底高亮（每节 1–2 处）。
  - **不展开任何 `::: details` 时，外部主干必须因果闭环、流畅易读**，禁止引用只有折叠框内才定义的符号或代码变量。
- **折叠层（`::: details 点击展开：<具体内容>`）**：统一收纳以下四类内容：
  1. **完整可运行脚本与环境检查命令**（主干只留核心几行或输出对照表）；
  2. **多步数学/显存/通信量推导**（严格一步一换行）；
  3. **MathJax 渲染版算法伪代码与符号对照表**（严格使用 `>` 引用块 + `$...$`）；
  4. **手算小算例与扩展「源码/命令 + 原始输出」实测记录**（折叠框内的代码和命令同样必须加注释，原始输出后必须附带关键字段分析，不得只贴裸代码和裸输出）。

### 2. 折叠容器书写规则

- 标题必须明确写出展开内容，格式统一为 `::: details 点击展开：<具体内容>`。
- **禁止三冒号容器嵌套**：在 `::: details` 内部不要再使用 `::: tip` / `::: warning`，改用 `> **注意**：...` 引用块。

## 五、主动配图、官方真图与柔和矢量 SVG 硬规范

**凡是讲解系统架构、组件关系、请求生命周期、训练/推理阶段对比、张量维度变换、内存排布或并行通信切分，必须采用「官方高质量原图 + 站点同款柔和矢量 SVG」配合讲解，禁止用纯文字描述或简陋 ASCII 字符画敷衍。**

### 1. 硬要求：每篇至少 1 张官方高质量网络图片

1. **必须检索并引入一手官方配图**：动笔或配图阶段，必须前往相关技术的一手官网（如 NVIDIA Developer Blog、NVIDIA CUDA / Nsight 官方文档、PyTorch 官方文档、vLLM/SGLang 官方文档或 arXiv 原论文）寻找高清机制图、Profile 实测截图或系统架构图。
2. **本地落盘 + 一手图注**：将确认无水印、高清晰度的官方图片下载至文章配套图片目录并引用（避免直接外链第三方 URL 失效），紧邻图注必须写明原始出处与直达链接，例如：
   `*图 4：Nsight Systems 下传统流发射与 CUDA Graphs 执行时间线对比。来源：[NVIDIA Technical Blog — Getting Started with CUDA Graphs](https://developer.nvidia.com/blog/cuda-graphs/)。*`

### 2. 自制架构图硬规则（外圈暖黄光晕 + 字体规范 + 柔和视觉）

AI Infra 教学图解通常包含大量中英文混排、数学上下标与代码标识，位图生图容易出现文字畸变或模糊，因此**自制架构图与流程图必须直接编写内联属性矢量 SVG**（仅当确实需要无密集文字的概念视觉插画且当前 Agent 具备图像生成工具时才可选用位图生成；**不要使用 Mermaid**，站点未装配 Mermaid 插件），并严格满足以下四条硬规则：

1. **画布比例（必须横向宽屏）**：统一采用 **16:9 横向宽屏画布** `viewBox="0 0 1120 620" width="1120" height="620"`（严格满足 `width / height >= 1.4`）。多阶段流程采用左—中—右三栏或「上左右对比 + 下三并列」布局，严禁生成 `1:1` 方图或竖向长图占满阅读视口。
2. **外圈暖黄光晕框线（站点标志性视觉骨架）**：每张 SVG 必须具备三层嵌套外框，形成外圈淡暖黄光晕包裹纯白主图卡的效果：
   - **底层画布（`#fffdf7`）**：全画布铺设 `<rect width="1120" height="620" fill="#fffdf7" />`，在主卡片四周留出 `18 px` 暖象牙黄过渡边带；
   - **柔光阴影滤镜（`#soft-shadow`）**：`<feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#222018" flood-opacity="0.05" />`；
   - **圆角白卡片（`#ffffff` + `#ebe3d0`）**：`<rect x="18" y="18" width="1084" height="584" rx="22" fill="#ffffff" stroke="#ebe3d0" stroke-width="1.5" filter="url(#soft-shadow)" />`，配合左上角暖金等宽副标题（`#925b00`）与主标题（`#222018`），保证整站所有配图呈现统一的暖光画框质感。
3. **字体栈与字重硬规则（绝对不得更改或省略）**：
   - **中文/正文/标题字体栈**：所有正文与标题 `<text>` 必须完整声明 `font-family="Inter, HarmonyOS Sans SC, PingFang SC, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"`；
   - **英文标签/刻度/代码字体栈**：顶部 Kicker、坐标轴数字、函数名与变量标注必须声明 `font-family="JetBrains Mono, Cascadia Code, SFMono-Regular, Consolas, monospace"`；
   - **字重只允许 `400` 与 `700`**：标题、阶段小标与核心结论用 `font-weight="700"`，正文、节点文字与轴刻度用 `font-weight="400"`。**严禁使用 `font-weight="600"`**（部分系统字体仅含 400/700 两档物理字重，使用 600 会触发合成加粗发虚）；
   - **数学上下标**：用 `<tspan dy="3" font-size="10">...</tspan>` 与 `<tspan dy="-3" font-size="14">...</tspan>` 精确偏移并恢复基线，不得混用错位字符。
4. **内部阶段容器与配色规范**：
   - 阶段分组外框统一用 `rx="18"`、`fill="#fffefb"`、`stroke="#d9d0bd"`、`stroke-width="1.4"`；
   - 内部节点卡片用 `rx="12"`–`rx="14"` 低饱和粉彩：暖琥珀（`#fff8dc` / 描边 `#e6c665`）、浅紫（`#f8f5ff` / `#c4b5fd`）、天蓝（`#eff6ff` / `#93c5fd`）、青绿（`#f0fdf4` / `#86efac`）；拒绝/失效项可配合淡红斜线 `<pattern id="soft-hatch-red">`；
   - 连接线与箭头统一用圆润线帽（`stroke-linecap="round"`）与小巧圆角箭头（`markerWidth="7" markerHeight="7"`），配合光滑三次贝塞尔曲线（`C ...`）绕开文字与边框。

### 3. SVG Few-Shot 母版（新建配图直接以此为骨架扩展）

下面这段完整最小可渲染母版展示了外圈 `#fffdf7` 暖黄光晕底板、`#ebe3d0` 柔边白卡、`soft-shadow` 滤镜、标准中英文字体栈、`400`/`700` 字重分工、阶段圆角容器、`tspan` 下标及圆角贝塞尔箭头；新建配图时直接保留 `<defs>`、底层画布与主卡片外框，再按需扩展内部栏位：

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 620" width="1120" height="620">
  <defs>
    <!-- 1. 主卡片外圈漫反射柔光阴影 -->
    <filter id="soft-shadow" x="-4%" y="-4%" width="108%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#222018" flood-opacity="0.05" />
    </filter>
    <!-- 2. 可选：拒绝/失效状态低饱和斜线填充 -->
    <pattern id="soft-hatch-red" width="10" height="10" patternTransform="rotate(38)" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#fef2f2" />
      <line x1="0" y1="0" x2="0" y2="10" stroke="#fecaca" stroke-width="2.2" />
    </pattern>
    <!-- 3. 圆润小箭头（按语义配色扩展 arr-teal / arr-amber / arr-purple / arr-blue） -->
    <marker id="arr-warm" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 2 2.5 L 9.5 6 L 2 9.5" fill="none" stroke="#8c8270" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </marker>
    <marker id="arr-teal" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 2 2.5 L 9.5 6 L 2 9.5" fill="none" stroke="#0d9488" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </marker>
  </defs>

  <!-- 必选外圈：暖象牙黄外框光晕底板 + 18px 留白白色大圆角主卡 -->
  <rect width="1120" height="620" fill="#fffdf7" />
  <rect x="18" y="18" width="1084" height="584" rx="22" fill="#ffffff" stroke="#ebe3d0" stroke-width="1.5" filter="url(#soft-shadow)" />

  <!-- 顶部：暖金等宽 Kicker (400) + 中文主标题 (700) -->
  <text x="52" y="56" font-family="JetBrains Mono, Cascadia Code, SFMono-Regular, Consolas, monospace" font-size="13" font-weight="400" fill="#925b00" letter-spacing="0.3">Topic Tag · Mechanism Overview</text>
  <text x="52" y="88" font-family="Inter, HarmonyOS Sans SC, PingFang SC, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="22" font-weight="700" fill="#222018" letter-spacing="-0.3">核心机制示意图主标题（简短陈述机制边界）</text>

  <!-- 左栏阶段容器 (rx="18", stroke="#d9d0bd") -->
  <rect x="52" y="118" width="460" height="442" rx="18" fill="#fffefb" stroke="#d9d0bd" stroke-width="1.4" />
  <rect x="76" y="136" width="412" height="32" rx="10" fill="#f0fdfa" />
  <text x="282" y="157" text-anchor="middle" font-family="Inter, HarmonyOS Sans SC, PingFang SC, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="15" font-weight="700" fill="#0f766e">阶段 1：输入状态与前置约束</text>

  <!-- 节点卡片（内嵌 tspan 下标，字重严格 400） -->
  <rect x="96" y="196" width="372" height="54" rx="13" fill="#fff8dc" stroke="#e6c665" stroke-width="1.4" />
  <text x="282" y="228" text-anchor="middle" font-family="Inter, HarmonyOS Sans SC, PingFang SC, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="14" font-weight="400" fill="#5c430d">输入张量 X<tspan dy="3" font-size="10">i</tspan><tspan dy="-3" font-size="14"> 留在片上 SRAM</tspan></text>

  <!-- 右栏阶段容器 -->
  <rect x="608" y="118" width="460" height="442" rx="18" fill="#fffefb" stroke="#d9d0bd" stroke-width="1.4" />
  <rect x="632" y="136" width="412" height="32" rx="10" fill="#eff6ff" />
  <text x="838" y="157" text-anchor="middle" font-family="Inter, HarmonyOS Sans SC, PingFang SC, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="15" font-weight="700" fill="#1d4ed8">阶段 2：并行执行与结果写回</text>

  <rect x="652" y="196" width="372" height="54" rx="13" fill="#eff6ff" stroke="#93c5fd" stroke-width="1.4" />
  <text x="838" y="228" text-anchor="middle" font-family="Inter, HarmonyOS Sans SC, PingFang SC, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="14" font-weight="400" fill="#1e3a8a">单次写回输出 Y<tspan dy="3" font-size="10">i</tspan><tspan dy="-3" font-size="14"> 到显存 HBM</tspan></text>

  <!-- 跨栏贝塞尔弯折箭头 + 独立标签胶囊 -->
  <path d="M 512 280 C 548 280, 572 280, 602 280" fill="none" stroke="#0d9488" stroke-width="1.9" stroke-linecap="round" marker-end="url(#arr-teal)" />
  <rect x="524" y="242" width="72" height="24" rx="7" fill="#f0fdfa" stroke="#99f6e4" stroke-width="1" />
  <text x="560" y="258" text-anchor="middle" font-family="Inter, HarmonyOS Sans SC, PingFang SC, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif" font-size="11" font-weight="700" fill="#0f766e">跨步复用</text>
</svg>
```

### 4. SVG 绘制工程纪律（防文字越框与兼容陷阱）

1. **全部使用内联属性，严禁 `<style>` 标签**：部分 PDF/Markdown 渲染器会丢弃 `<style>` 类选择器，所有 `fill`、`stroke`、`font-family`、`font-size`、`font-weight`、`text-anchor` 必须直接写在对应图形与文本节点属性上。
2. **严格执行上方字体栈与 `400/700` 字重**：不得缩写回退链，不得混用 `font-weight="600"`。
3. **为中文文本留足安全余量**：每个汉字按不小于字号 `1.15 倍` 宽度估算，矩形容器两侧至少留出 `16–24 px` 内边距；多行说明显式拆分为多个 `<text>` 节点，避免贴边或溢出。
4. **文字与连线彻底避让**：箭头与引导线绝不能穿过文字标签、胶囊框或标题边框；优先绕行框外或为说明胶囊预留独立空白通道。

### 5. 强制视觉检查闭环（画完/生成必看）

每张自制 SVG、位图插画或下载的官网图片放入文章前，**必须执行以下检查闭环**：

1. 若为 SVG，先通过无头浏览器（如 Chrome / Edge / Chromium `--headless --window-size=1120,620 --screenshot`）或 SVG 渲染工具以原尺寸 `1120×620` 渲染为 PNG 预览图；若为位图或下载图，直接读取图像文件。
2. 用多模态图像查看工具逐块核查：
   - 外圈暖黄光晕框线（`#fffdf7` 底板 + `rx="22"` `#ebe3d0` 主卡）是否完整呈现、无边缘裁切？
   - 是否有任何文字（含数字、上下标、图例）超出矩形框或画布边缘？
   - 是否有相邻标签互相重叠、或箭头线穿过文字胶囊与标题边框？
   - 字体是否清晰锐利（无合成发虚）？
   - 若为官方截图：分辨率是否清晰、与正文机制是否强对应？
3. **发现任何溢出、错字、截断或遮挡问题，必须立即修改源 SVG 并重新渲染看图检查，直到完全干净无瑕疵，才可引用进正文。**

### 6. 图文强绑定

图片插入正文后，必须附带斜体图注（`*图 N：……*`），并在紧邻段落中**按图中的区域、颜色或步骤编号逐一指认讲解**，让图成为论证的主体部件而非装饰。
