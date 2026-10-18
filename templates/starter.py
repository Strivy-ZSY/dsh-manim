"""起始场景 —— 一个能直接渲染、带旁白的四拍讲解骨架。

用法：
  1. **先出旁白**（音频优先，这是讲解片唯一不会对不上的顺序）：
     `manim_voice(action='speak', lines=[{id:'b1',text:'…'}, …])`
     → 生成 `voice/*.wav` 和 `voice/cues.json`；
  2. 改下面的文字成你要讲的内容，在 `construct` 里按拍子加图形
     （`panel` / `chip` / `arrow` / `mathtex`）；
  3. 先按草稿画质渲染确认节奏（面板里选「草稿 480p15」，或
     `manim_render(path=..., quality="draft")`），最后再出 1080p60。

**没有旁白也能跑**：`voice/cues.json` 不存在时下面的 `cues` 就是 None，
`hold()` 全部跳过，画面按自己的时长演。有了旁白之后同一份代码自动变成"画面等旁白"。

为什么用 `manimkit` 而不是裸 manim：
  * `text()` 会自动按内容选中文字体（Pango 遇到缺字是画一排空心方块，不是报错）；
  * `caption()` / `panel()` / `chip()` / `section_title()` 给出统一版式，换一集不用重新调；
  * `mathtex()` 用来排版公式（matplotlib mathtext，不依赖 LaTeX），所以
    **不要用 `MathTex` / `Tex`** —— 那两个要完整 TeX 发行版 + dvisvgm，
    缺了就在第一个公式处抛 `latex error converting to dvi`。
    ⚠️ 公式里**不要写中文**，matplotlib 的数学字体没有 CJK，会静默画成一排空框；
    中文用 `text()` 单独放。（`mathtex()` 现在会直接报错拦住这种写法。）
  * `narration()` / `hold()` 把旁白挂上去，并让画面撑到那句说完。

节奏建议：一段动画 0.6–1.2 秒；旁白每句 ≤ 40 字（约 3–6 秒），句间靠 `hold()` 的气口。
"""

from manim import *  # noqa: F403

from manimkit import (  # noqa: F401
    ACCENT,
    BG,
    COLORS,
    GRID,
    INK,
    MUTED,
    OK,
    WARN,
    arrow,
    caption,
    chip,
    find_cue_sheet,
    hold,
    mathtex,
    narration,
    panel,
    section_title,
    text,
)


class __SCENE_CLASS__(Scene):
    """一集讲解片：标题 → 问题 → 方法 → 结论。"""

    def construct(self):
        # 有旁白就用旁白：一行挂上整条音轨，每拍末尾用 hold() 等它说完。
        # 路径相对「场景文件所在目录」找，所以场景挪位置也不会失联。
        cue_sheet = find_cue_sheet("voice/cues.json")
        cues = narration(self, cue_sheet) if cue_sheet is not None else None

        def wait_voice(cue_id: str) -> None:
            """等这一拍的旁白说完（没有旁白时什么都不做）。"""
            if cues is not None:
                hold(self, cues, cue_id)

        # ---------- 第 1 拍：标题 ----------
        # section_title 自带 kicker（上方小字）和一条下划线；标题先居中出现，
        # 再缩到顶部当"这一集的页眉"，后面的内容就有地方摆了。
        head = section_title("把方法讲清楚", kicker="概览", size=46)
        self.play(Write(head), run_time=1.0)
        self.play(head.animate.to_edge(UP).scale(0.8), run_time=0.6)
        wait_voice("b1")

        # ---------- 第 2 拍：问题 ----------
        # caption() 是钉在画面底部的字幕条，宽度固定 —— 固定宽度才不会在换字幕
        # 时看起来像镜头在跳。
        # ⚠️ 把它存进变量：字幕条不会自己消失，换下一条时必须显式 FadeOut 掉旧的，
        #    否则两条会叠在一起（第一版就是这么错的，抽帧才看出来）。
        cap1 = caption("先给出问题的形状：输入是什么、要得到什么")
        self.play(FadeIn(cap1), run_time=0.6)

        left = chip("输入 x", ACCENT)
        right = chip("输出 y", OK)
        left.move_to(LEFT * 4.2)
        right.move_to(RIGHT * 4.2)
        self.play(FadeIn(left), FadeIn(right), run_time=0.6)
        wait_voice("b2")

        # ---------- 第 3 拍：方法 ----------
        # panel() 给块加圆角边框和标题 —— 画"网络结构/流程"就用它，
        # arrow() 自己按两个块的相对位置找边，横排竖排都能直接用。
        # ⚠️ 造出来的 mobject 必须 play/add 进场景才会出现：光 move_to 是看不见的。
        # ⚠️ 箭头也要先存变量：self.play(Create(arrow(a, b))) 不给引用，
        #    以后 FadeOut 不到它，它会一直挂到后面每一拍上。
        bridge = panel(text("中间发生了什么", size=26), title="方法", color=ACCENT)
        bridge.move_to(ORIGIN)
        to_bridge = arrow(left, bridge)
        from_bridge = arrow(bridge, right)
        self.play(FadeIn(bridge), run_time=0.5)
        self.play(Create(to_bridge), Create(from_bridge), run_time=0.9)

        # 公式：mathtex() 用的是 matplotlib 的 mathtext，支持 \frac \sqrt \sum
        # \int \mathbb \mathcal 上下标和 \left( \right)。
        formula = mathtex(r"L = \mathbb{E}\left[\| f_\theta(x) - y \|^2\right]", size=38, color=INK)
        formula.next_to(bridge, DOWN, buff=0.9)
        self.play(FadeIn(formula, shift=UP * 0.2), run_time=0.9)
        wait_voice("b3")

        # ---------- 第 4 拍：结论 ----------
        self.play(FadeOut(formula), FadeOut(cap1), FadeIn(caption("这一页要留给观众的一句结论")), run_time=0.7)
        wait_voice("b4")


# 提示：文件里可以有多个 Scene 子类（比如 Draft / Final 两版），
# 渲染时用 scene="类名" 指明要哪一个。
# 手动渲染（一般用不到，走面板或 manim_render 工具）：
#   runtime\venv\Scripts\python.exe -m manim render -qh <本文件> <类名>
