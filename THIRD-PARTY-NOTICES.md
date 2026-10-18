# 第三方组件与致谢

本仓库**自己的代码**（`src/`、`lib/`、`runtime/manimkit/`、`runtime/engine/`、`tools/`、
`skills/`、`templates/`）以 **MIT** 发布，见 [LICENSE](LICENSE)。

它站在别人的肩上。下面按「本仓库分发了什么 / 运行时由 pip 装了什么 / 用了谁的服务」分开写清楚。

---

## 1. 致谢：Manim

本插件的全部动画能力来自 **[Manim](https://www.manim.community/)**。

- 项目：Manim Community — <https://github.com/manimcommunity/manim>
- 作者：**The Manim Community Developers**，以及 **Grant "3Blue1Brown" Sanderson**（Manim 的创造者）
- 许可：**MIT**
- 本插件使用的版本：`manim==0.22.0`

没有 Manim Community 把 Manim 从一个个人项目做成可安装、可测试、文档完整的库，这个插件不会存在。
原始项目（3b1b/manim）开创的「用代码精确控制每一帧」的思路，以及 `Scene` / `Mobject` /
`Animation` 这一整套抽象，都是 Grant Sanderson 的设计。

**本仓库不含任何 Manim 源码副本。** `runtime/engine/driver.py` 只是调用 Manim 的公开 API
（`Scene`、`config`、渲染器），`runtime/manimkit/` 是本插件自研的版式与主题层。

## 2. 致谢：公式排版

`runtime/manimkit/mathkit.py` 用 **matplotlib** 的 mathtext 引擎排版公式，从而**不需要 LaTeX**。

- 项目：matplotlib — <https://matplotlib.org/> — 许可：matplotlib License（BSD 兼容）
- 同样的选择还依赖 **ManimPango**（MIT，Pango 绑定，`Text` 的排版后端）

## 3. 运行时依赖（由 `npm run setup:runtime` 从 PyPI 安装，不是本仓库分发的文件）

插件在 `runtime/venv` 里建自己的虚拟环境并 `pip install`，被装进来的包各自保留自己的许可：

| 包 | 版本 | 许可 | 用途 |
|---|---|---|---|
| manim | 0.22.0 | MIT | 渲染引擎 |
| ManimPango | 0.7.0 | MIT | 文字排版（Pango 绑定） |
| matplotlib | 3.11.x | matplotlib License（BSD 兼容） | `mathtex()` 公式排版 |
| av (PyAV) | 19.0.1 | BSD-3-Clause | 视频编码 + 音频转 WAV（因此不需要 ffmpeg 二进制） |
| pydub | 0.25.1 | MIT | manim 读 `add_sound` 音频的通道 |
| pycairo | 1.29.x | LGPL-2.1-only OR MPL-1.1 | cairo 渲染器后端 |
| moderngl / pyglet / glcontext | — | MIT / BSD 系 | OpenGL 渲染器（本插件默认不用） |
| edge-tts | 7.3.x | **LGPL-3.0** | 可选：`manim_voice(engine='edge')` 的旁白 |
| numpy · scipy · pillow · imageio-ffmpeg · tqdm 等 | — | 各自（BSD / MIT / MPL 等） | 传递依赖 |

完整清单以 `pip freeze` 为准；每个包的许可文件都在 `runtime/venv/Lib/site-packages/*.dist-info/` 里。

**关于 `edge-tts`（LGPL-3.0）**：它不随本仓库分发，也不是本插件代码的一部分——它是运行时可选依赖，
`sapi` 引擎完全不需要它。本插件的 MIT 代码不因调用它而改变许可；若你分发打包好的 venv，请注意
LGPL 对「可替换/可重链接」的要求。

## 4. 用到的外部服务与系统组件

| 来源 | 说明 |
|---|---|
| **Microsoft Edge 朗读服务**（经 `edge-tts`） | 在线 TTS，语音由 Microsoft 提供。免费、无需 API key，但使用须遵守 Microsoft 的服务条款；`engine='auto'` 优先它 |
| **Windows SAPI** | 离线语音，音色来自你系统里安装的 Microsoft 语音包（如 `Microsoft Huihui Desktop`） |
| **Pango / cairo / OpenGL** | 文字排版、矢量绘制、可选 GPU 渲染，由上面的 Python 包经系统库调用 |

## 5. 本插件自研 / 未借鉴的部分

- `runtime/engine/driver.py` —— 自写的渲染驱动（plan/render/frames/probe，stdout 走 NDJSON 事件），
  不是 `python -m manim render` 的包装
- `runtime/manimkit/` —— 主题、版式（`caption`/`panel`/`chip`/`section_title`）、`mathtex()`、
  旁白对时（`narration`/`hold`）
- 面板与宿主半边（`src/`）、工具、skill

这些是本仓库的原创代码，以 MIT 发布。

---

如果上面漏了谁的署名，或某个版本/许可已变，请开 issue —— 这个文件宁可长，不该漏。
