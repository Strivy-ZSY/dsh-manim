# dsh-manim · 动画工作室

DSH 的 Manim 插件：**侧边栏「动画」行 + 右侧栏「动画工作室」tab + 会话内渲染引擎**，
外加四个 agent 工具（`manim_scene` / `manim_render` / `manim_frames` / `manim_voice`）和一份
「怎么把论文做成讲解视频」的 skill。**带旁白** —— 不需要下载任何语音模型。

```
侧边栏「动画」                        右侧栏「动画工作室」tab
  └─ 点一下打开 tab                     ├─ 场景文件列表（扫整个工作区）
                                       ├─ 画质（草稿 → 4K）＋ 渲染 / 取消
                                       ├─ 成片播放器（支持拖动跳转）
                                       ├─ 分镜条（点一帧跳到那一刻）
                                       └─ 进度 / 实时日志
```

设计上与本机的 `dsh-ppt` / `dsh-drawio` 同源：**宿主解析、浏览器渲染、结构化回传**。
区别在于这里渲染的是视频，所以多了一个真正跑得起来的 Python 运行时（见下）。

---

## 为什么自带一个虚拟环境

插件的渲染器是 manim 0.22，装在插件自己的 `runtime/venv` 里，**不用机器上的 `python`**：

- 本机的 `python` 是 anaconda base，用户自己的 numpy / scipy / opencv 都在里面。
  往别人要用的解释器里装渲染器、再把 numpy 钉到 manim 想要的版本，不是插件该干的事。
- `runtime/setup-runtime.mjs` 把这件事做一次，之后每次渲染都是确定性的。

```powershell
node C:\Users\user\.idsh\local\dsh-manim\runtime\setup-runtime.mjs          # 建/修 venv
node C:\Users\user\.idsh\local\dsh-manim\runtime\setup-runtime.mjs --check  # 只检查
```

**不需要 ffmpeg。** manim 0.22 通过 PyAV 在进程内编码，本机 PATH 上本来也没有 ffmpeg。
这条是这套运行时能在 Windows 上真的装起来的关键 —— 早期版本的 manim 要一个 `ffmpeg.exe`
和一个 `dvisvgm.exe`，这两个在这台机器上都拿不到。

---

## 配音：不需要下载语音模型

`manim_voice` 工具走两条现成的路，`auto` 优先第一条：

| 引擎 | 音质 | 需要什么 | 音色 |
|---|---|---|---|
| `edge`（Microsoft Edge 朗读，经 `edge-tts`） | 接近真人 | 联网，免费、无需 key | 14 个中文：`zh-CN-XiaoxiaoNeural`（晓晓）、`YunxiNeural`、`YunyangNeural` … |
| `sapi`（Windows 自带 SAPI） | 机械 | 完全离线 | `Microsoft Huihui Desktop`、`Kangkang`、`Yaoyao` |

工作顺序是 **audio-first**：先出旁白（拿到每句时长），再写画面。

```python
manim_voice(action='speak', lines=[{'id':'b1','text':'第一句…'}, {'id':'b2','text':'第二句…'}])
```

→ 生成 `animations/voice/*.wav` + `animations/voice/cues.json`（每句的 `at` 起点与 `duration`）。
场景里两行：

```python
from manimkit import find_cue_sheet, hold, narration

    def construct(self):
        sheet = find_cue_sheet("voice/cues.json")
        cues = narration(self, sheet) if sheet is not None else None
        self.play(Write(title), run_time=1.0)
        if cues is not None:
            hold(self, cues, "b1")      # 画面撑到第 1 句说完
```

`narration()` 的路径按 **cue sheet 自己的位置**解析（先 cwd、再 manim 的 `config.input_file`
所在目录），所以从哪渲染都不会失联。`hold()` 会在"这一拍比旁白慢"时告警；
渲染器会在"旁白比画面长、结尾被截断"时告警 —— 两条都要当回事。

**两个实测的硬约束**（都写在 `PATCH-NOTES-manim.md` §1.6）：

1. `add_sound` 只能吃 **WAV**：manim 走 pydub，而 pydub 解非 WAV 要 `ffmpeg` 二进制，本机没有
   （manim 0.22 只用 PyAV 编视频，所以此前一直没暴露）。edge 的 mp3 由 `voice.py` 用 PyAV 转。
2. manim 混流用 `shortest=1`，**旁白超出画面长度的部分会被静默切掉** —— 所以驱动渲染完会读回
   容器比对音视频时长并告警。

不想用 TTS 就直接替换 `voice/cues.json` + 音频文件（结构就是
`{"cues":[{"id","text","file","duration","at"}]}`），场景代码一个字都不用改。

---

## 这台机器上 LaTeX 是坏的（会影响你写场景）

| 组件 | 状态 |
|---|---|
| MiKTeX 2.9 (`E:\CTEX\MiKTeX`) | 编译 manim 生成的 `standalone` 文档**段错误**（exit 139，`.log` 是空的） |
| `dvisvgm` | **不存在**（MiKTeX 2.9 没带，PyPI 上也没有任何 wheel 提供它） |
| 结论 | `MathTex` / `Tex` 一律不能用，会在第一个公式处抛 `latex error converting to dvi` |

替代方案是 `manimkit.mathtex()`：走 matplotlib 的 mathtext 引擎（就是画 `$…$` 轴标签那个），
支持 `\frac \sqrt \sum \int \mathbb \mathcal \hat` 和上下标，不需要任何外部程序。
它渲染成透明底 PNG 再包成 `ImageMobject` —— 为什么不走 SVG、为什么不把 matplotlib 的
路径直接转成 `VMobject`，`runtime/manimkit/mathkit.py` 的模块注释里写了（两条路都真的试过）。

如果哪天换了机器（或者修好了 MiKTeX 并装上 `dvisvgm`），`has_latex()` 会自动改走真正的
`MathTex`，场景文件一个字都不用动；`DSH_MANIM_TEX=1/0` 可以强制。

---

## 目录

```
src/
  config.ts                  配置 + 画质预设 + 默认解释器路径
  engine.ts                  渲染引擎：spawn 驱动、读 NDJSON 事件、任务表
  service.ts                 工作区门控、场景扫描、渲染编排、抽帧、模板
  routes.ts                  /dsh-manim 路由（POST JSON + GET Range 流）
  tools.ts                   manim_scene / manim_render / manim_frames
  skills.ts                  把 skills/**/SKILL.md 交给 skill 注册表
  index.ts                   apply()：路由 + 工具 + skill + 正向标记
  client/
    api.ts                   浏览器侧 fetch 客户端
    studio.tsx               面板主体（选场景 / 渲染 / 播放 / 分镜 / 日志）
    panel-row.tsx            三个 shell 座位：tab 类型、tab 本体、侧边栏行
    panel-icon.tsx           图标：左栏单色线稿 + 右栏彩色 mark 两套方言
    tab-title.tsx            tab 上的彩色 mark + 标题
    locales.ts / i18n.ts     中英文案（占位符一律 {name}）
runtime/
  setup-runtime.mjs          建 venv、装 manim + matplotlib、写 manimkit 的 .pth
  engine/driver.py           渲染驱动：plan / render / list / frames / probe，stdout 是 NDJSON
  manimkit/                  屋式主题：theme.py / mathkit.py / layout.py
templates/starter.py         起始场景（面板的「新场景」和 manim_scene(template) 都用它）
skills/manim-explainer/      方法：怎么把论文拆成 4–8 拍、版式与节奏纪律、常见坑
tools/                       build.mjs / test-offline.mjs / platform-modules.mjs / …
```

---

## 渲染驱动为什么单独写一个

`runtime/engine/driver.py` 不是 `python -m manim render` 的包装，是一个自己的驱动脚本。
四条理由：

1. **媒体目录归插件管。** CLI 会往用户工作区写 `./media/…`；驱动把 `config.media_dir`
   指到插件缓存，工作区只在最后收到一个 `.mp4`。
2. **进度是机器可读的。** CLI 的 tqdm 进度条是终端产物；驱动在每段动画边界和动画内部
   每 ~0.25 秒发一个事件，面板因此有真正的进度条（`第 3/12 段`、已用时间、当前动画名）。
3. **有一个 plan 阶段。** `plan: true` 会先用关掉绘制的渲染器 + 1fps 跑一遍
   `construct()`（几秒而不是几分钟），量出总段数和总时长；它同时是一次
   "语法/场景名"前置检查 —— 长渲染之前先快速失败。
4. **不需要 PATH 上有 ffmpeg**（见上）。

事件的契约（stdout，一行一个 JSON）写在 `driver.py` 的模块注释里，改任何一边都要同步。

---

## 配置

profile patch 里可以覆盖的键（都有默认值，`config: {}` 也能跑）：

| 键 | 默认 | 说明 |
|---|---|---|
| `agentTools` | 三个全开 | 暴露给模型的工具；`'*'` 或 `[]` |
| `pythonPath` | `runtime/venv/Scripts/python.exe` | 换解释器 |
| `driverPath` | `runtime/engine/driver.py` | 换驱动 |
| `cacheDir` | `<插件>/cache` | 渲染缓存（manim 的 partial_movie 也在里面） |
| `outputDir` | `animations` | 成片复制到工作区的哪个子目录；`''` = 不复制 |
| `background` | `#10141c` | 场景背景色 |
| `defaultQuality` | `1080p60` | 不指明画质时用哪个 |
| `maxSceneBytes` | 512 KB | 超过这个大小的 `.py` 不扫描 |
| `jobTtlSeconds` | 1800 | 渲染完成后任务记录保留多久 |
| `renderTimeoutSeconds` | 3600 | 单次渲染的硬上限 |

---

## 测试

```powershell
node tools/build.mjs                 # 打两个 bundle
node tools/test-offline.mjs --fast   # 纯逻辑（几秒）
node tools/test-offline.mjs          # 含一次真实草稿渲染 + 抽帧 + HTTP 路由（约一分钟）
node tools/check-panel-markup.mjs    # 把面板的 view 渲染成 HTML 串断言结构
```

离线测试跑的是**已构建的 `lib/index.js`**（不是源码副本），所以它验证的是真正会加载的
那份代码。它覆盖：静态场景扫描、工作区门控、路由信封与 403/404、Range 请求、
真实 mp4 落盘、抽帧、三个工具的主要动作。

> `node_modules/@deepseek-ai/*` 是**指向 DSH 安装目录的 junction**（和 `dsh-ppt` 同一做法）：
> 宿主半边只 import 一个 `@deepseek-ai/dsh-tools`，而插件树本来没有自己的 `node_modules`
> （注册走绝对路径就是为了不动 profile 的依赖）。没有这几个 junction，离线测试连
> `lib/index.js` 都 import 不进来。**它们不影响 DSH 里的加载。**

改完插件按 `~/.idsh/AGENTS.md` §1 还要跑真机隔离测试：

```powershell
pwsh -File C:\Users\user\.idsh\local\tools\isolated-launch-test.ps1 `
     -Plugin dsh-manim -Marker 'dsh-manim: 动画工作室已 attach'
```

真页面验证的方法（`dsh web` 一次性实例 + 浏览器驱动）与实测证据在
`PATCH-NOTES-manim.md` §3.3；截图在 `evidence/`。

---

## 已知限制

- **LaTeX 不可用** ⇒ 公式走 `mathtex()`（位图，大幅推近会糊）。
- **plan 阶段会把 `construct()` 跑两遍**（同进程；省掉的是第二次 import manim 的 ~8 秒）。
- **任务表在内存里**：DSH 重启丢任务，但成片和索引在磁盘上，面板重开还能播。
- **没有 GPU 加速**（cairo 渲染器），4K60 很慢。
