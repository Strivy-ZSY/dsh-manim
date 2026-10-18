/**
 * dsh-manim surface copy (zh / en).
 *
 * Two rules from this repo's own history, both of which cost a round trip once:
 *
 * * Placeholders must be written `{name}` — the shell's `fill()` is the only
 *   thing that substitutes, and a string like `[name]` is shown verbatim.
 * * **Three names, on purpose.** The left rail's row, the right sidebar's tab
 *   chip and the 开始 guide's capsule are three different surfaces with three
 *   different amounts of room:
 *
 *   - rail row + tab chip → `动画`: both sit in a strip of short object names
 *     (工作区文件 / 画板 / 幻灯片 / 终端 / 浏览器 / 记忆), and a five-character
 *     「动画工作室」 was the longest chip in the strip — the user pointed at it
 *     and asked for the short one.
 *   - guide capsule → `动画工作室`: the 开始 page has a whole row per entry and a
 *     description line beside it, so the fuller name has room and reads better
 *     there. That is the one place the "-工作室" suffix earns its keep.
 *
 * @module dsh-manim/client/locales
 */

export const ZH = {
  'entry.label': '动画',
  'entry.tip': '让论文/方法动起来，导出讲解视频',
  'tab.label': '动画',
  'guide.title': '动画工作室',
  'guide.description': '渲染 Manim 场景，看片，出讲解视频',

  'panel.loading': '正在扫描工作区…',
  'panel.noRoot': '没有可用的工作区，先打开一个会话项目。',
  'panel.pickRoot': '选一个工作区来放动画：',
  'panel.pickRootHint': '面板拿不到当前会话的目录（宿主不同，会话快照的形状也不同），所以列已注册的工作区让你选。',
  'video.title': '视频',
  'files.onDisk': '工作区里的成片',
  'runtime.missing': '渲染运行时还没装好（约 500 MB，一次性）。',
  'runtime.setup': '搭建运行时',
  'runtime.building': '正在搭建运行时，下载约 500 MB，请稍候…',
  'video.loading': '正在读取视频…',
  'panel.empty': '工作区里还没有场景文件',
  'panel.emptyHint': '点「新场景」生成一个带主题和字幕的起始场景，然后让 agent 按你要讲的论文/方法改它。',
  'panel.refresh': '刷新',
  'panel.error': '出错了：{message}',

  'files.toggle': '文件',
  'files.title': '已渲染的视频',
  'files.tip': '切换看哪一条成片（每个画质各算一条）',
  'files.empty': '还没有渲染结果，先渲染一条',

  'scene.title': '场景文件',
  'scene.count': '{count} 个',
  'scene.never': '未渲染',
  'scene.rendered': '上次 {quality} · {duration}',
  'scene.new': '新场景',
  'scene.newPrompt': '新场景的名字（生成 animations/<名字>.py）',
  'scene.creating': '正在创建…',
  'scene.class': '场景类',
  'scene.multiple': '这个文件里有多个场景，点一个开始渲染',

  'quality.label': '画质',
  'quality.draftHint': '改内容时用草稿，定稿再出高清',

  'render.start': '开始渲染',
  'render.cancel': '取消',
  'render.planning': '正在计划（测量动画段数与总时长）…',
  'render.running': '渲染中',
  'render.done': '渲染完成',
  'render.failed': '渲染失败',
  'render.cancelled': '已取消',
  'render.busy': '这个场景正在渲染',
  'render.stage': '第 {done}/{total} 段',
  'render.stageUnknown': '第 {done} 段',
  'render.elapsed': '已用 {time}',
  'render.remaining': '预计还需 {time}',
  'render.duration': '时长 {time}',
  'render.plays': '{count} 段动画',
  'render.noServe': '还没有可播放的成片',

  'player.title': '成片',
  'player.output': '已输出到 {path}',
  'player.cache': '（缓存副本 {path}）',
  'player.open': '播放',

  'board.title': '分镜',
  'board.generate': '抽取分镜',
  'board.generating': '正在抽帧…',
  'board.empty': '还没有分镜；渲染完成后会自动生成',
  'board.seek': '跳到第 {time} 秒',
  'board.hint': '点一帧跳到那一刻',

  'log.title': '日志',
  'log.empty': '（暂无输出）',
  'log.show': '展开日志',
  'log.hide': '收起日志',
  'log.copy': '复制',

  'probe.title': '运行时',
  'probe.ready': 'Manim {version} 就绪',
  'probe.missing': '运行时还没装好',
  'probe.missingHint': '在终端跑一遍：node "{path}"',
  'probe.noTex': 'LaTeX 不可用：公式请用 manimkit.mathtex()',
  'probe.tex': 'LaTeX 可用：MathTex/Tex 正常',
  'probe.run': '自检',

  'time.seconds': '{value} 秒',
  'time.minutes': '{value} 分',
  'time.minutesSeconds': '{minutes} 分 {seconds} 秒',
  'time.unknown': '未知',
} as const

export const EN: Record<keyof typeof ZH, string> = {
  'entry.label': 'Animation',
  'entry.tip': 'Turn a paper or method into an explainer video',
  'tab.label': 'Animation',
  'guide.title': 'Animation studio',
  'guide.description': 'Render Manim scenes, watch them, export an explainer',

  'panel.loading': 'Scanning the workspace…',
  'panel.noRoot': 'No workspace available — open a session project first.',
  'panel.pickRoot': 'Pick a workspace for the animations:',
  'panel.pickRootHint': 'This panel cannot read the current session directory (session snapshots differ between shells), so it lists the registered workspaces instead.',
  'video.title': 'Video',
  'files.onDisk': 'Films already in the workspace',
  'runtime.missing': 'The render runtime is not installed yet (~500 MB, one time).',
  'runtime.setup': 'Build runtime',
  'runtime.building': 'Building the runtime — downloading ~500 MB, hold on…',
  'video.loading': 'Loading video…',
  'panel.empty': 'No scene files in this workspace yet',
  'panel.emptyHint': 'Press "New scene" to scaffold a themed starter, then have the agent adapt it to your paper or method.',
  'panel.refresh': 'Refresh',
  'panel.error': 'Failed: {message}',

  'files.toggle': 'Files',
  'files.title': 'Rendered videos',
  'files.tip': 'Switch which finished video you are watching (one entry per quality)',
  'files.empty': 'Nothing rendered yet — render one first',

  'scene.title': 'Scene files',
  'scene.count': '{count} files',
  'scene.never': 'never rendered',
  'scene.rendered': 'last {quality} · {duration}',
  'scene.new': 'New scene',
  'scene.newPrompt': 'Name for the new scene (creates animations/<name>.py)',
  'scene.creating': 'Creating…',
  'scene.class': 'Scene class',
  'scene.multiple': 'This file defines several scenes — pick one to render',

  'quality.label': 'Quality',
  'quality.draftHint': 'Iterate on draft, render the final cut at high quality',

  'render.start': 'Render',
  'render.cancel': 'Cancel',
  'render.planning': 'Planning (measuring animation count and duration)…',
  'render.running': 'Rendering',
  'render.done': 'Render finished',
  'render.failed': 'Render failed',
  'render.cancelled': 'Cancelled',
  'render.busy': 'This scene is already rendering',
  'render.stage': 'Animation {done}/{total}',
  'render.stageUnknown': 'Animation {done}',
  'render.elapsed': '{time} elapsed',
  'render.remaining': 'about {time} left',
  'render.duration': '{time} long',
  'render.plays': '{count} animations',
  'render.noServe': 'No finished video yet',

  'player.title': 'Video',
  'player.output': 'Written to {path}',
  'player.cache': '(cache copy {path})',
  'player.open': 'Play',

  'board.title': 'Storyboard',
  'board.generate': 'Extract frames',
  'board.generating': 'Extracting…',
  'board.empty': 'No storyboard yet — it is generated after a render',
  'board.seek': 'Seek to {time}s',
  'board.hint': 'Click a frame to jump there',

  'log.title': 'Log',
  'log.empty': '(no output yet)',
  'log.show': 'Show log',
  'log.hide': 'Hide log',
  'log.copy': 'Copy',

  'probe.title': 'Runtime',
  'probe.ready': 'Manim {version} ready',
  'probe.missing': 'Runtime is not installed',
  'probe.missingHint': 'Run this in a terminal: node "{path}"',
  'probe.noTex': 'LaTeX unavailable — use manimkit.mathtex() for formulas',
  'probe.tex': 'LaTeX available — MathTex/Tex work',
  'probe.run': 'Check',

  'time.seconds': '{value}s',
  'time.minutes': '{value}m',
  'time.minutesSeconds': '{minutes}m {seconds}s',
  'time.unknown': 'unknown',
}
