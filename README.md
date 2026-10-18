# dsh-manim · 动画工作室

把论文、方法或任何流程说明渲染成**带旁白的讲解视频**，全程在编辑器里完成。

一个 DSH 插件，提供：

- 左侧栏「动画」入口 + 右侧栏「动画工作室」面板（场景列表 / 画质 / 渲染 / 播放 / 分镜 / 实时日志）
- 四个 agent 工具：`manim_scene` · `manim_render` · `manim_frames` · `manim_voice`
- 一份随包 skill `manim-explainer`：怎么把一篇论文拆成 4–8 拍、版式与节奏纪律、常见坑

渲染器是 [Manim](https://www.manim.community/) 0.22，装在插件自己的虚拟环境里，不碰系统 Python。
旁白用系统/在线 TTS，**不需要下载任何语音模型**。

![面板结构](https://img.shields.io/badge/panel-%E5%8A%A8%E7%94%BB%E5%B7%A5%E4%BD%9C%E5%AE%A4-1f6feb)

---

## 环境要求

| 需要 | 版本 / 说明 |
|---|---|
| Node.js | `^22.19.0 \|\| >=24` |
| Python | ≥ 3.10，**只用来创建插件自己的 venv**（不会往你的解释器里装东西） |
| DSH 宿主 | 本插件是 DSH 插件（注册侧边栏槽位 + agent 工具），需要宿主才能运行 |

**不需要装的东西**（这是本插件刻意设计的）：

| 不需要 | 为什么 |
|---|---|
| **LaTeX / TeX 发行版** | 公式走 `manimkit.mathtex()`（matplotlib 的 mathtext 引擎），不需要 `latex`、不需要 `dvisvgm`。检测到可用 LaTeX 时会自动升级成真正的 `MathTex`，但没有也完全能用 |
| **ffmpeg** | manim 0.22 用 PyAV 在进程内编码；旁白的 mp3 也由 PyAV 转成 WAV |
| **任何语音模型** | 旁白走 Edge 朗读（联网、免费、免 key）或 Windows SAPI（离线） |
| **额外的 npm 运行时依赖** | 两侧只用宿主已提供的包（`react`、`@deepseek-ai/dsh-client-*` 由 DSH 宿主注入）；`npm install` 装的只是构建与测试用的 devDependencies |

---

## 安装

```bash
git clone https://github.com/Strivy-ZSY/dsh-manim.git
cd dsh-manim

npm install            # 只为构建与测试装 esbuild / react（运行时不需要）
npm run setup:runtime  # 建 runtime/venv，装 manim 0.22 + matplotlib 与 manimkit 的路径
npm run build          # src/ → lib/（面板 bundle + 宿主半边）
```

`npm run setup:runtime` 可用参数：

```bash
node runtime/setup-runtime.mjs --check          # 只检查，不安装
node runtime/setup-runtime.mjs --python <exe>   # 指定基础解释器
```

### 挂进 DSH

在 profile 的 patch 文件里加一条 insert，指向这份 checkout 的入口：

```yaml
- insert:
    - id: dsh-manim
      name: '<绝对路径>/dsh-manim/lib/index.js'
```

首次加载后，左侧栏出现「动画」行，右侧栏出现「动画工作室」tab，四个 `manim_*` 工具进入会话工具表。

---

## 用法

**面板**：点「动画」→ 选一个场景文件（扫整个工作区的 `.py`）→ 选画质 → 渲染。
渲染完可拖动播放、点分镜条跳到某一刻；日志实时滚动，可随时取消。

**会话里**：

```python
manim_scene(action='template', name='MyExplainer')   # 从模板起一个场景
manim_render(path='animations/MyExplainer.py', quality='draft')
manim_frames(path='animations/MyExplainer.py', count=6)
manim_voice(action='list')                            # 看可用音色
```

工作顺序建议 **audio-first**：先出旁白拿到每句时长，再写画面。

### 配音

`manim_voice` 提供两条路，`engine='auto'` 优先第一条：

| 引擎 | 音质 | 需要什么 | 音色 |
|---|---|---|---|
| `edge` | 接近真人 | 联网，免费、免 key | 14 个中文，含 `zh-CN-XiaoxiaoNeural` |
| `sapi` | 机械 | 完全离线（Windows） | `Microsoft Huihui Desktop` 等 |

生成 `animations/voice/*.wav` + `cues.json`（每句的 `at` 与 `duration`），场景里两行挂上：

```python
from manimkit import find_cue_sheet, hold, narration

def construct(self):
    sheet = find_cue_sheet("voice/cues.json")
    cues = narration(self, sheet) if sheet is not None else None
    self.play(Write(title), run_time=1.0)
    if cues is not None:
        hold(self, cues, "b1")     # 画面撑到第 1 句说完
```

`narration()` 按 cue sheet 自己的位置解析路径，从哪渲染都不会失联。

不想用 TTS 就直接替换 `cues.json` 与音频文件（结构
`{"cues":[{"id","text","file","duration","at"}]}`），场景代码一个字都不用改。

---

## 公式：为什么不需要 LaTeX

manim 自带的 `Tex` / `MathTex` 会 `shell out` 到 `latex` 再 `dvisvgm`——这个组合要求一整套 TeX
发行版，在很多机器上缺失或损坏（Windows 尤其常见），一旦缺了就在第一个公式处抛
`ValueError: latex error converting to dvi`。

所以本插件默认用 `manimkit.mathtex()`：走 matplotlib 的 mathtext（就是画 `$…$` 轴标签那个引擎），
支持 `\frac` `\sqrt` `\sum` `\int` `\mathbb` `\mathcal` `\hat`、上下标、`\left(`/`\right)`，
**不需要任何外部程序**。它渲染成透明底 PNG 再包成 `ImageMobject`。

- 若机器上确实有可用的 LaTeX，`has_latex()` 会自动改走真正的 `MathTex`，场景文件不用改
- 可用 `DSH_MANIM_TEX=1` / `=0` 强制开关
- `mathtex()` 里**不要写中文**（matplotlib 数学字体没有 CJK，会画成空框）——中文用 `text()` 单独放

---

## 目录

```
src/
  config.ts            配置 + 画质预设 + 默认解释器路径
  engine.ts            渲染引擎：spawn 驱动、读 NDJSON 事件、任务表
  service.ts           工作区门控、场景扫描、渲染编排、抽帧、模板
  routes.ts            /dsh-manim 路由（POST JSON + GET Range 流）
  tools.ts             manim_scene / manim_render / manim_frames / manim_voice
  skills.ts            把 skills/**/SKILL.md 交给 skill 注册表
  index.ts             apply()：路由 + 工具 + skill + 正向 attach 标记
  client/              面板：studio.tsx / panel-row.tsx / 图标 / i18n
runtime/
  setup-runtime.mjs    建 venv、装 manim + matplotlib、写 manimkit 的 .pth
  engine/driver.py     渲染驱动：plan / render / list / frames / probe，stdout 为 NDJSON
  manimkit/            主题与版式：theme.py / mathkit.py / layout.py
templates/starter.py   起始场景（面板的「新场景」与 manim_scene(template) 共用）
skills/manim-explainer/ 方法：怎么拆拍、版式与节奏纪律、常见坑
tools/                 build.mjs / test-offline.mjs / check-panel-markup.mjs
```

### 为什么自带虚拟环境

插件不往系统解释器里装东西：`runtime/venv` 由 `setup-runtime.mjs` 建一次，之后渲染是确定性的。
`manim==0.22.0` 钉在 requirements 里，换机器结果一致；你的 numpy / scipy / opencv 不受影响。

### 为什么驱动单独写

`runtime/engine/driver.py` 不是 `python -m manim render` 的包装：

1. **媒体目录归插件管** —— 不会往工作区写 `./media/…`，工作区只收到一个 `.mp4`
2. **进度机器可读** —— 每段动画边界与动画内 ~0.25 秒发一个 NDJSON 事件，面板才有真正的进度条
3. **有 plan 阶段** —— 关绘制 + 1fps 先把 `construct()` 跑一遍，几秒内量出段数与总时长，
   长渲染之前先快速失败
4. **不依赖 PATH 上的 ffmpeg**

事件契约写在 `driver.py` 模块注释里，改任何一边都要同步。

---

## 配置

patch 里可覆盖的键（全部有默认值，`config: {}` 也能跑）：

| 键 | 默认 | 说明 |
|---|---|---|
| `agentTools` | 四个全开 | 暴露给模型的工具；`'*'` 或 `[]` |
| `pythonPath` | `runtime/venv/Scripts/python.exe` | 换解释器（Linux/macOS 为 `runtime/venv/bin/python`） |
| `driverPath` | `runtime/engine/driver.py` | 换驱动 |
| `cacheDir` | `<插件>/cache` | 渲染缓存（manim 的 partial_movie 也在里面） |
| `outputDir` | `animations` | 成片复制到工作区哪个子目录；`''` = 不复制 |
| `background` | `#10141c` | 场景背景色 |
| `defaultQuality` | `1080p60` | 默认画质 |
| `maxSceneBytes` | 512 KB | 超过此大小的 `.py` 不扫描 |
| `jobTtlSeconds` | 1800 | 任务记录保留时长 |
| `renderTimeoutSeconds` | 3600 | 单次渲染硬上限 |

---

## 开发与测试

```bash
npm run build                        # 打两个 bundle
node tools/test-offline.mjs --fast   # 纯逻辑（几秒）
node tools/test-offline.mjs          # 含一次真实草稿渲染 + 抽帧 + HTTP 路由（约一分钟）
node tools/check-panel-markup.mjs    # 把面板 view 渲染成 HTML 串断言结构
```

离线测试跑的是**已构建的 `lib/index.js`**（不是源码副本），验证的是真正会加载的那份代码：
静态场景扫描、工作区门控、路由信封与 403/404、Range 请求、真实 mp4 落盘、抽帧、工具主要动作。

`esbuild` / `react` / `react-dom` / `@deepseek-ai/dsh-tools`（宿主包，npm 上公开）都是
**devDependencies**，只在构建与测试时需要。两条检查都会优雅降级而不是假装通过：
`check-panel-markup` 没装 `react` 时打印 `SKIP` 并以 0 退出；`test-offline` 在没有
`runtime/venv` 时跳过 `probe` 相关断言并提示去跑 `npm run setup:runtime`。

---

## 故障排查

| 现象 | 原因与处理 |
|---|---|
| `no python interpreter found` | 装 Python ≥3.10，或用 `--python <路径>` 指定 |
| `esbuild not found` | 没跑 `npm install`；或用 `DSH_ESBUILD_ROOT=<node_modules 路径>` 指一份现成的 |
| `SKIP: react / react-dom not installed` | 同上，`npm install` 后该检查会真正执行 |
| `npm install` 之后 `node_modules` 几乎是空的 | 你的 npm 配置了 `omit=dev`，改用 `npm install --include=dev` |
| 渲染报 `latex error converting to dvi` | 场景里用了 `MathTex`/`Tex` 而机器没有可用 LaTeX ⇒ 改用 `manimkit.mathtex()` |
| 加旁白报 pydub/ffmpeg 相关错误 | `add_sound` 只吃 **WAV**；`manim_voice` 产出的就是 WAV，自己塞 mp3 需先转 |
| 成片结尾旁白被切掉 | manim 混流用 `shortest=1`；驱动会比对音视频时长并告警，把画面加长或旁白缩短 |
| 面板一片空白 | 先 `npm run build`（`lib/` 是构建产物），再确认宿主加载的是 `lib/index.js` |

---

## 已知限制

- 公式走位图（`mathtex()`），大幅推近会糊；要矢量公式就得装可用的 LaTeX
- plan 阶段会把 `construct()` 跑两遍（同进程，省掉再 import manim 的 ~8 秒）
- 任务表在内存里：宿主重启丢任务记录，但成片与索引在磁盘上，面板重开还能播
- 没有 GPU 加速（cairo 渲染器），4K60 很慢

---

## License

MIT
