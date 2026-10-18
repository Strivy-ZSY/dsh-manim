---
name: manim-explainer
description: >
  把论文、方法或任何技术内容做成讲解动画视频时读这个：怎么把内容拆成 4–8 拍、
  怎么用 manimkit 的屋式主题写场景、怎么按草稿画质快速迭代、怎么抽帧自检、
  最后怎么出 1080p60 成片。触发词：讲解视频、动画、manim、论文动画、
  方法演示、explainer、视频讲解、把这篇论文讲清楚。
---

# 做讲解视频（Manim）

目标不是"把论文念一遍配上动画"，而是**让观众在 2–4 分钟里跟上一个论证**：
每一拍只放一个想法，画面替观众记住"现在讲到哪了"。

---

## 0. 先记住这台机器的四件事

1. **不要用 `MathTex` / `Tex`。** 这台机器上 LaTeX 是坏的（MiKTeX 2.9 编译
   `standalone` 直接段错误，`dvisvgm` 根本没装，也没有任何 pip wheel 提供它）。
   写 `MathTex` 的场景会在第一个公式处抛
   `ValueError: latex error converting to dvi`。
   **公式一律用 `manimkit.mathtex()`**（内部走 matplotlib 的 mathtext，
   支持 `\frac \sqrt \sum \int \mathbb \mathcal \hat` 和上下标）。

2. **中文要用 `manimkit.text()`。** Pango 缺字不会报错，而是画一排空心方块——
   即"看起来渲染成功、画面全是豆腐"。`text()` 按内容自动选字体
   （有中文就用 Microsoft YaHei，否则交给 Pango 默认），别绕过它手写 `Text(...)`。

3. **画质预设**：`draft`(480p15) / `720p30` / `1080p60`（默认）/ `1440p60` / `4k60`。
   迭代一律用 `draft`——一集 2 分钟的内容，草稿是几十秒，1080p60 是几十分钟。
   60fps 的渲染时间差不多是 30fps 的两倍，讲解视频里除了平滑的缓动几乎没有区别，
   `1080p60` 已经是"够好"的默认。

4. **场景放 `animations/`**（工作区相对路径），一个 `.py` 可以放多个 Scene 类；
   有多个时渲染要指明 `scene="类名"`。

---

## 1. 工作流（照做，别跳步）

```
① 读材料      →  把论文/方法读成"哪几拍"，每拍写一句旁白
①' manim_voice(action='speak', lines=[…])
              → 先出旁白（音频优先：拿到每句时长，画面才知道该演多久）
② manim_scene(action='template', name='XxxExplainer')
              → 起一个能直接渲染的骨架
③ manim_scene(action='write', path='animations/XxxExplainer.py', source=...)
              → 写这一集的内容（工具会做语法检查）
④ manim_render(path=..., quality='draft')
              → 渲染草稿，工具会返回 4 张分镜 PNG
⑤ read_image 看那 4 张 PNG → 改 → 回到 ③
   （版式/文字重叠/出框只有看图才发现，"渲染成功"什么都不保证）
   同一步也要听：渲染器会在旁白被截断时告警
⑥ manim_render(path=..., quality='1080p60')
              → 定稿出片
```

**第 ⑤ 步是质量的分水岭。** 不要交出自己没看过的动画。
「渲染成功」什么都不保证 —— 实测第一版是「100% 渲染成功、五条箭头挂错了后面每一拍」，
只有看图才发现。

---

## 2. 旁白：让片子会说话

**不需要下载任何语音模型。** 这台机器上已经有两条路：

| 引擎 | 音质 | 需要什么 | 音色 |
|---|---|---|---|
| `edge`（默认） | 接近真人 | 联网（无需 key、免费） | 14 个中文：`zh-CN-XiaoxiaoNeural`（晓晓，新闻/小说）、`YunxiNeural`（云希）、`YunyangNeural`（云扬，新闻）… |
| `sapi` | 机械 | 完全离线 | `Microsoft Huihui Desktop`、`Kangkang`、`Yaoyao` |

先看一眼有什么：`manim_voice(action='list')`。

### 音频优先（audio-first）：旁白先定，画面跟着它走

这是本仓做讲解片的**唯一正确顺序**。反过来（画面先做好、再往里塞旁白）一定会对不上：
你没法知道"这一拍"该演多久。

```
① 写脚本：每一拍一句旁白（一句 ≤ 40 字，读起来约 3–6 秒）
② manim_voice(action='speak', lines=[{id:'b1',text:'…'}, {id:'b2',text:'…'}])
   → 生成 voice/*.wav + voice/cues.json（每句的 at 起点 和 duration 时长）
③ 写场景：把这一拍的动画写完，然后 hold(cues, 'b1') 把画面撑到旁白说完
④ manim_render → 有声音的成片
```

### 场景里长这样

```python
from manim import *
from manimkit import *

class Explained(Scene):
    def construct(self):
        # 一行把整条旁白挂上去（路径按 cue sheet 自己的位置解析，和 cwd 无关）
        cues = narration(self, "voice/cues.json")

        head = section_title("要讲的题目", kicker="第 1 拍", size=44)
        self.play(Write(head), run_time=0.9)
        hold(self, cues, "b1")          # ← 画面停在这里，直到第 1 句说完

        self.play(FadeIn(caption("这一拍的关键句")), run_time=0.6)
        hold(self, cues, "b2")

        self.play(head.animate.to_edge(UP), run_time=0.5)
        hold(self, cues, "b3")
```

`hold()` 返回实际等了多久；`hold(self, cues, 'b1', extra=0.3)` 可以在句尾多留 0.3 秒的气口。

### 三条纪律

1. **画面总长必须 ≥ 旁白总长。** manim 混流用的是 `shortest`，旁白超出的部分会被**静默切掉**。
   DSH 的渲染器会替你检查并给一条告警（"旁白比画面长 X 秒，结尾被截断了"）—— 看到就回去加 `hold()`。
2. **`hold()` 会告警"这一拍比旁白慢"。** 那说明动画本身演完了旁白还在说，下一句会压上来。
   把这拍的动画拆短，或者把旁白拆成两句。
3. **改过台词就要重新 `manim_voice(action='speak')`。** 缓存按"文本+音色+语速+引擎"做 key，
   改了字自然重生成没改的那些不重做 —— 但 cue sheet 里的 `at` 会变，场景不用动（它只认 id）。

### 想换音色 / 换语速

```python
manim_voice(action='speak', voice='zh-CN-YunyangNeural', rate='-10%', lines=[...])
```

`rate` 是 Edge 的写法（`'+10%'` / `'-15%'`）。给 sapi 时工具会自动折算成它的 -10…10 档。

### 不想用 TTS

把 `voice/cues.json` 换成你自己录的音频即可 —— 它的结构就是
`{"cues":[{"id","text","file","duration","at"}]}`，`file` 是相对 cue sheet 的文件名。
场景代码一个字都不用改。

---

## 3. 怎么拆拍：论文讲解的六拍

| 拍 | 内容 | 画面 |
|---|---|---|
| 1 | 这是要解决什么 | 标题 + 一句话问题 |
| 2 | 为什么难 | 现有做法的失败情形（一个反例） |
| 3 | 核心想法 | 一个能被一句话概括的机制 |
| 4 | 怎么做到的 | 结构/流程图（`panel` + `arrow`） |
| 5 | 代价与取舍 | 关键公式（`mathtex`）、超参、复杂度 |
| 6 | 结论 | 一句可复述的话 + 数字（提升多少） |

四到八拍都正常。**超过八拍就该拆成两集**——观众记不住，你也讲不完。

每拍的开头是一个**动词短语的问题**，不是"接下来介绍 XXX"。

---

## 4. 骨架长什么样

```python
from manim import *
from manimkit import *          # text / caption / panel / chip / arrow /
                                # section_title / mathtex / INK / ACCENT / OK / WARN

class WhatItSolves(Scene):
    def construct(self):
        head = section_title("现有做法错在哪", kicker="第 2 拍", size=44)
        self.play(Write(head), run_time=0.9)
        self.play(head.animate.to_edge(UP).scale(0.8), run_time=0.5)

        cap = caption("一句话说清这一拍")
        self.play(FadeIn(cap), run_time=0.5)

        a = chip("输入", ACCENT); b = chip("重建", OK)
        a.move_to(LEFT * 3.6); b.move_to(RIGHT * 3.6)
        self.play(FadeIn(a), FadeIn(b), run_time=0.5)
        self.play(Create(arrow(a, b)), run_time=0.5)

        eq = mathtex(r"\hat{y} = \mathcal{D}(z),\quad z\sim q(z\mid x)", size=36)
        eq.next_to(b, DOWN, buff=0.9)
        self.play(FadeIn(eq, shift=UP * 0.2), run_time=0.8)
        self.wait(1.2)
```

---

## 5. manimkit 速查

| 调用 | 作用 |
|---|---|
| `text(s, size=32, color=INK)` | 自动选字体的文字（**always use this**） |
| `caption(s, width=…)` | 钉在画面底部的字幕条（宽度固定，换字幕不跳） |
| `section_title(s, kicker=…)` | 标题 + 上方小字 + 下划线；`head.animate.to_edge(UP)` 变页眉 |
| `panel(content, title=…)` | 带标题的圆角框（画结构/模块） |
| `chip(s, color=ACCENT)` | 小药丸标签（当节点用） |
| `arrow(a, b)` | 两个块之间的箭头，按相对位置自动找边 |
| `mathtex(r"...", size=40, color=INK)` | 公式（**唯一的公式写法**） |
| `narration(self, "voice/cues.json")` | 把整条旁白挂上场景，返回 cue sheet |
| `hold(self, cues, "b1")` | 把这一拍撑到第 b1 句说完（写讲解片的核心动作） |
| `COLORS` | 分类配色：`#4d9cff #3fbf7f #f0a23c #b07cff #ef5f6b #37c2d0` |
| `INK / MUTED / GRID / OK / WARN` | 主文字 / 次要 / 网格线 / 绿 / 橙 |

配色纪律：**一张画里不超过 3 种分类色**，颜色只用来区分"不同类的东西"，
不用来装饰。强调用 `ACCENT`，成功用 `OK`，警告用 `WARN`。

---

## 6. 版式与节奏纪律

- **一拍一个想法。** 一屏同时出现三个新概念，观众就都记不住。
- **一屏文字 ≤ 30 字**（中文）。要讲一段话就拆成两拍，或者把它放进 `caption`。
- **动画 0.5–1.2 秒**。`Write` 一整段长文字会拖到 2 秒以上，改成
  `FadeIn(text, shift=UP*0.2)`。
- **停 1–2 秒再切下一拍**（`self.wait(1.2)`）。读字幕比你以为的慢。
- **安全区**：上下左右各留 0.5 个单位；`caption()` 已经帮你避开了下边缘。
- **元素换位用 `.animate`**：`self.play(mob.animate.next_to(...), run_time=0.6)`，
  不要 `FadeOut` + `FadeIn`（那会让画面"闪"）。
- **一集的最后一帧要能单独看懂**：结论那拍结束时观众截图都应该看得懂。

---

## 7. 常见坑

| 症状 | 原因 / 解法 |
|---|---|
| `latex error converting to dvi` | 用了 `MathTex`/`Tex` → 改 `mathtex()` |
| 中文变成一排空心方块 | 手写了 `Text(...)` → 改 `text(...)` |
| 文字超出画面 | 字号太大或没分行；用 `caption()`；渲染后看分镜确认 |
| 两个元素叠在一起 | `next_to(a, DOWN, buff=0.5)` 里的 `buff` 太小；分镜会暴露 |
| 渲染很慢 | 用了 1080p60 迭代内容 → 先 `draft` |
| `scene not found` | 文件里有多个 Scene 类，渲染时补 `scene="类名"` |
| 只有一个 `self.play` 却等很久 | 那一拍把所有东西都塞进了一段动画；拆成几段 |
| 分镜里某一拍是空的 | 那段的 `self.play` 只有 `wait`，或者元素被移出画面了 |
| **公式里的中文变成一排空框** | matplotlib 的数学字体没有 CJK，`	ext{共享}` 不报错、尺寸也不变，只有成片里看得见。中文用 `text()` 单独放。（`mathtex()` 现在会直接报错拦住你。） |
| **`Group`/`VGroup` 加不进公式** | `mathtex()` 返回的是 `ImageMobject`，`VGroup.add` 只收 `VMobject`，会报 "Only values of type VMobject can be added as submobjects"。公式要和别的元素同组，一律用 `Group`。 |
| **造好的框/图根本没出现** | 只 `move_to()` 不会让它出现在场景里 —— 必须 `self.play(FadeIn(x))` 或 `self.add(x)`。（起始模板第一版就这么错过：`panel()` 造出来、`move_to` 了、然后只 play 了箭头。） |
| **两条字幕叠在一起** | `caption()` 不会自己消失。换字幕要 `FadeOut(旧的那条)`（所以要把每条存进变量）。 |
| **箭头指向空处** | 箭头连的那个 mobject 没被加进场景（同上一条） |
| **某一拍之后箭头/标注一直挂着** | `self.play(Create(arrow(a,b)))` 不给你留引用 —— 想在这拍结尾 `FadeOut` 它就做不到，它会出现在后面每一拍上。先把箭头存进变量（`arr = arrow(a,b)`），再 `self.play(Create(arr))`，`FadeOut` 才有东西可指。 |
| **某一拍的元素活到了后面每一拍上** | `Create(x)` 只把它加进场景，**不会替我们留引用** —— 写成 `self.play(Create(arrow(a,b)))` 就没法在拍尾 `FadeOut`。每个 `Create` 都要有名字，按拍收进一个组一起清。 |
| `Only values of type VMobject can be added as submobjects of VGroup` | 把 `mathtex()`（它是 `ImageMobject`）和别的元素塞进了同一个 `VGroup` —— 改用 `Group`，它两种都收。 |
| **公式里的中文变成一排豆腐块** | `mathtex()` 走 matplotlib，`rm` 字体没有 CJK 字形，**不报错、画占位方块**。公式里只放 Latin/Greek，中文一律 `text()`。 |

---

## 8. 交付前验收清单

- [ ] `manim_render(quality='draft')` 的分镜四张都看过，没有重叠/出框/错字
- [ ] 公式用的是 `mathtex()`，中文用的是 `text()`
- [ ] 每一拍都在 4–8 秒之间，整片 1–5 分钟
- [ ] 结论那拍有一句可以复述的话
- [ ] 有旁白：`manim_voice` 生成过，场景里 `narration()` + 每拍一个 `hold()`
- [ ] 渲染日志里**没有**"旁白比画面长…被截断"和"这一拍比旁白慢"两条告警
- [ ] 最后以 `1080p60` 出片（面板里能看到成片；文件同时复制到了
      `animations/<场景名>-1080p60.mp4`）
