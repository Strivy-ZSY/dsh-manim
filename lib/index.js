// src/config.ts
import { join } from "node:path";
import { fileURLToPath } from "node:url";
var TOOL_IDS = ["manim_scene", "manim_render", "manim_frames", "manim_voice"];
var QUALITIES = [
  { id: "draft", label: "\u8349\u7A3F 480p15", width: 854, height: 480, fps: 15 },
  { id: "720p30", label: "\u6807\u6E05 720p30", width: 1280, height: 720, fps: 30 },
  { id: "1080p60", label: "\u9AD8\u6E05 1080p60", width: 1920, height: 1080, fps: 60 },
  { id: "1440p60", label: "\u8D85\u6E05 1440p60", width: 2560, height: 1440, fps: 60 },
  { id: "4k60", label: "4K 2160p60", width: 3840, height: 2160, fps: 60 }
];
var DEFAULT_QUALITY = "1080p60";
function qualityById(id) {
  return QUALITIES.find((quality) => quality.id === id);
}
var PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
function defaultRuntimeDir() {
  return join(PLUGIN_ROOT, "runtime");
}
function defaultPythonPath() {
  const root = join(defaultRuntimeDir(), "venv");
  return process.platform === "win32" ? join(root, "Scripts", "python.exe") : join(root, "bin", "python");
}
function resolveConfig(raw) {
  const tools = raw?.agentTools;
  const agentTools = tools === "*" ? "*" : Array.isArray(tools) ? tools.filter((id) => TOOL_IDS.includes(id)) : [...TOOL_IDS];
  const quality = typeof raw?.defaultQuality === "string" ? raw.defaultQuality : "";
  const number = (value, fallback, min, max) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
  return {
    agentTools,
    pythonPath: typeof raw?.pythonPath === "string" && raw.pythonPath !== "" ? raw.pythonPath : defaultPythonPath(),
    runtimeDir: typeof raw?.runtimeDir === "string" && raw.runtimeDir !== "" ? raw.runtimeDir : defaultRuntimeDir(),
    // Off by default. The official client already owns its left rail, and a
    // plugin row wedged between its own entries reads as damage rather than as a
    // feature; the tab is reachable from the right sidebar's own controls.
    sidebarEntry: raw?.sidebarEntry === true,
    driverPath: typeof raw?.driverPath === "string" && raw.driverPath !== "" ? raw.driverPath : join(PLUGIN_ROOT, "runtime", "engine", "driver.py"),
    voicePath: typeof raw?.voicePath === "string" && raw.voicePath !== "" ? raw.voicePath : join(PLUGIN_ROOT, "runtime", "engine", "voice.py"),
    cacheDir: typeof raw?.cacheDir === "string" && raw.cacheDir !== "" ? raw.cacheDir : join(PLUGIN_ROOT, "cache"),
    outputDir: typeof raw?.outputDir === "string" ? raw.outputDir : "animations",
    background: typeof raw?.background === "string" && raw.background !== "" ? raw.background : "#10141c",
    defaultQuality: qualityById(quality) ? quality : DEFAULT_QUALITY,
    maxSceneBytes: number(raw?.maxSceneBytes, 512 * 1024, 4096, 64 * 1024 * 1024),
    jobTtlSeconds: number(raw?.jobTtlSeconds, 1800, 60, 86400),
    renderTimeoutSeconds: number(raw?.renderTimeoutSeconds, 3600, 60, 43200),
    maxInflightEncoders: number(raw?.maxInflightEncoders, 4, 1, 32)
  };
}
function exposed(config, id) {
  return config.agentTools === "*" || config.agentTools.includes(id);
}

// src/engine.ts
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
var PYTHON_ENV = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };
var LOG_LIMIT = 400;
var SWEEP_INTERVAL_MS = 6e4;
async function runDriver(options) {
  const { pythonPath, driverPath, spec, cwd, timeoutMs = 12e4 } = options;
  return await runPythonSpec({ pythonPath, scriptPath: driverPath, spec, cwd, timeoutMs });
}
async function runPythonSpec(options) {
  const { pythonPath, scriptPath: driverPath, spec, cwd, timeoutMs = 12e4 } = options;
  return await new Promise((resolve4, reject) => {
    const events = [];
    let stderr = "";
    const child = spawn(pythonPath, [driverPath, JSON.stringify(spec)], {
      cwd: cwd ?? dirname(driverPath),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: PYTHON_ENV
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`driver timed out after ${Math.round(timeoutMs / 1e3)}s`));
    }, timeoutMs);
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseEvent(line);
        if (event !== null) events.push(event);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-8e3);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`cannot start ${pythonPath}: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const tail = parseEvent(buffer);
      if (tail !== null) events.push(tail);
      const failure = events.find((event) => event.ev === "error");
      if (failure !== void 0) {
        reject(new Error(String(failure.message ?? "driver failed")));
        return;
      }
      if (code !== 0) {
        reject(new Error(`driver exited with code ${code}
${stderr.slice(-1200)}`));
        return;
      }
      resolve4(events);
    });
  });
}
function parseEvent(line) {
  const text = line.trim();
  if (text === "" || !text.startsWith("{")) return null;
  try {
    const value = JSON.parse(text);
    if (typeof value !== "object" || value === null) return null;
    const record = value;
    if (typeof record.ev !== "string") return null;
    return record;
  } catch {
    return null;
  }
}
function initialProgress() {
  return { done: 0, index: 0, total: null, fraction: null, animFraction: 0, elapsed: 0, label: "" };
}
var RenderEngine = class {
  /**
   * @param options - interpreter and driver to spawn, job TTL, and the hard
   *   ceiling on one render.
   */
  constructor(options) {
    this.options = options;
    this.timer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }
  jobs = /* @__PURE__ */ new Map();
  children = /* @__PURE__ */ new Map();
  timer;
  /** Stop the sweeper and kill anything still running. */
  dispose() {
    clearInterval(this.timer);
    for (const id of [...this.children.keys()]) this.cancel(id);
  }
  /** Every job, newest first. */
  list() {
    return [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
  }
  /** One job by id. */
  get(id) {
    return this.jobs.get(id);
  }
  /** The most recent job for one scene file, if any. */
  latestFor(root, path) {
    return this.list().find((job) => job.root === root && job.path === path);
  }
  /** Drop a finished job from the map (the artifact stays on disk). */
  forget(id) {
    const job = this.jobs.get(id);
    if (job === void 0 || job.endedAt === null) return false;
    this.jobs.delete(id);
    return true;
  }
  /**
   * Start a render.
   *
   * @param spec - the driver spec (mode `render`).
   * @param meta - identity the job needs for lookups.
   * @returns the job, already in `planning` state.
   */
  start(spec, meta) {
    const id = randomUUID();
    const job = {
      id,
      root: meta.root,
      path: meta.path,
      scene: meta.scene,
      quality: meta.quality,
      state: "planning",
      progress: initialProgress(),
      log: [],
      startedAt: Date.now(),
      endedAt: null,
      result: null,
      error: null,
      frames: [],
      published: false,
      origin: meta.origin
    };
    this.jobs.set(id, job);
    this.spawnJob(job, spec);
    return job;
  }
  /** Ask a running job to stop. Returns whether it was running. */
  cancel(id) {
    const child = this.children.get(id);
    const job = this.jobs.get(id);
    if (child === void 0 || job === void 0) return false;
    job.state = "cancelled";
    job.endedAt = Date.now();
    this.children.delete(id);
    child.kill();
    const escalate = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
      }
    }, 4e3);
    escalate.unref?.();
    this.pushLog(job, "\u5DF2\u8BF7\u6C42\u53D6\u6D88\u6E32\u67D3", "warn");
    return true;
  }
  /** Register stills the service extracted for a finished job. */
  setFrames(id, frames) {
    const job = this.jobs.get(id);
    if (job !== void 0) job.frames = frames;
  }
  spawnJob(job, spec) {
    let child;
    try {
      child = spawn(this.options.pythonPath, [this.options.driverPath, JSON.stringify(spec)], {
        // Run from the scene's directory so a project-local `manim.cfg` and
        // relative asset paths behave the way they would under the plain CLI.
        cwd: spec.sceneFile === void 0 ? dirname(this.options.driverPath) : dirname(spec.sceneFile),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: PYTHON_ENV
      });
    } catch (error) {
      job.state = "failed";
      job.endedAt = Date.now();
      job.error = { kind: "spawn", message: error instanceof Error ? error.message : String(error) };
      return;
    }
    this.children.set(job.id, child);
    this.pushLog(job, `python ${this.options.pythonPath}`, "info");
    const deadline = setTimeout(() => {
      this.pushLog(job, `\u6E32\u67D3\u8D85\u8FC7 ${this.options.renderTimeoutSeconds}s\uFF0C\u5DF2\u7EC8\u6B62`, "error");
      this.cancel(job.id);
    }, this.options.renderTimeoutSeconds * 1e3);
    deadline.unref?.();
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseEvent(line);
        if (event !== null) this.handleEvent(job, event);
      }
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      const lines = stderr.split("\n");
      stderr = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() !== "") this.pushLog(job, line.trimEnd(), "info");
      }
    });
    child.on("error", (error) => {
      clearTimeout(deadline);
      this.pushLog(job, `\u65E0\u6CD5\u542F\u52A8\u6E32\u67D3\u8FDB\u7A0B\uFF1A${error.message}`, "error");
      this.finish(job, "failed", { kind: "spawn", message: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(deadline);
      this.children.delete(job.id);
      if (stderr.trim() !== "") this.pushLog(job, stderr.trimEnd(), "info");
      if (job.state === "cancelled" || job.state === "done") return;
      if (job.error !== null) {
        this.finish(job, "failed", job.error);
        return;
      }
      if (code !== 0) {
        this.finish(job, "failed", { kind: "exit", message: `\u6E32\u67D3\u8FDB\u7A0B\u9000\u51FA\u7801 ${code}` });
        return;
      }
      this.finish(job, "failed", { kind: "protocol", message: "\u6E32\u67D3\u8FDB\u7A0B\u6CA1\u6709\u8FD4\u56DE\u7ED3\u679C" });
    });
  }
  handleEvent(job, event) {
    switch (event.ev) {
      case "progress": {
        job.state = "rendering";
        const total = typeof event.total === "number" ? event.total : null;
        job.progress = {
          done: typeof event.done === "number" ? event.done : job.progress.done,
          index: typeof event.plays === "number" ? event.plays : job.progress.index,
          total,
          fraction: typeof event.frame === "number" ? event.frame : null,
          animFraction: typeof event.animFraction === "number" ? event.animFraction : 0,
          elapsed: typeof event.elapsed === "number" ? event.elapsed : 0,
          label: typeof event.label === "string" ? event.label : ""
        };
        break;
      }
      case "plan": {
        job.state = "planning";
        job.progress.total = typeof event.plays === "number" ? event.plays : null;
        if (typeof event.scene === "string") job.scene = event.scene;
        this.pushLog(
          job,
          `\u8BA1\u5212\uFF1A\u5171 ${job.progress.total ?? "?"} \u6BB5\u52A8\u753B\uFF0C\u603B\u65F6\u957F ${typeof event.duration === "number" ? event.duration.toFixed(1) : "?"} \u79D2`,
          "info"
        );
        break;
      }
      case "phase": {
        if (event.state === "start" && event.phase === "render") {
          job.state = "rendering";
          job.progress = { ...job.progress, elapsed: 0 };
          this.pushLog(job, "\u5F00\u59CB\u6E32\u67D3", "info");
        }
        break;
      }
      case "log": {
        this.pushLog(job, String(event.text ?? ""), String(event.level ?? "info"));
        break;
      }
      case "result": {
        const video = typeof event.video === "string" ? event.video : null;
        if (video === null) {
          this.finish(job, "failed", { kind: "protocol", message: "\u7ED3\u679C\u91CC\u6CA1\u6709\u89C6\u9891\u8DEF\u5F84" });
          return;
        }
        job.result = {
          video,
          duration: typeof event.duration === "number" ? event.duration : null,
          plays: typeof event.plays === "number" ? event.plays : job.progress.done,
          width: typeof event.width === "number" ? event.width : 0,
          height: typeof event.height === "number" ? event.height : 0,
          fps: typeof event.fps === "number" ? event.fps : 0
        };
        if (typeof event.scene === "string") job.scene = event.scene;
        job.progress.done = job.result.plays;
        job.progress.fraction = 1;
        this.finish(job, "done", null);
        break;
      }
      case "error": {
        job.error = {
          kind: String(event.kind ?? "internal"),
          message: String(event.message ?? "\u6E32\u67D3\u5931\u8D25"),
          ...typeof event.traceback === "string" ? { traceback: event.traceback } : {}
        };
        break;
      }
      default:
        break;
    }
  }
  finish(job, state, error) {
    if (job.endedAt !== null) return;
    job.state = state;
    job.endedAt = Date.now();
    job.error = error;
    this.children.delete(job.id);
  }
  pushLog(job, text, level) {
    job.log.push(level === "info" ? text : `[${level}] ${text}`);
    if (job.log.length > LOG_LIMIT) job.log.splice(0, job.log.length - LOG_LIMIT);
  }
  sweep() {
    const cutoff = Date.now() - this.options.jobTtlSeconds * 1e3;
    for (const job of this.jobs.values()) {
      if (job.endedAt !== null && job.endedAt < cutoff) this.jobs.delete(job.id);
    }
  }
};

// src/service.ts
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import { spawn as spawn2 } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname as dirname2, isAbsolute, join as join2, relative, resolve, sep } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  "site-packages",
  "dist",
  "build",
  ".next",
  ".cache",
  ".mypy_cache",
  ".pytest_cache",
  "media",
  // Source checkouts of libraries (a Manim clone is the common one): its own
  // `manim/scene/*.py` files define `class ZoomedScene(Scene)` and would
  // otherwise be offered as "your scenes".
  "manim-main",
  "manim",
  "example_scenes",
  "examples",
  "tests",
  "test"
]);
var VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;
var LIBRARY_MARKERS = ["pyproject.toml", "setup.py", "setup.cfg"];
async function isLibraryCheckout(dir, isRoot) {
  if (isRoot) return false;
  for (const marker of LIBRARY_MARKERS) {
    if (existsSync(join2(dir, marker))) return true;
  }
  return false;
}
var MAX_SCAN_DEPTH = 5;
var MAX_SCAN_FILES = 600;
var MAX_SCAN_BYTES = 512 * 1024;
function parseSetupProgress(line) {
  const marker = line.match(/##dsh-manim-progress (\d{1,3}) (.+)$/);
  if (marker !== null) {
    const percent = Math.max(0, Math.min(100, Number(marker[1])));
    return { kind: "installing", phase: marker[2].trim(), percent };
  }
  if (/^Collecting /i.test(line)) return { kind: "collecting", phase: "\u4E0B\u8F7D\u4F9D\u8D56", percent: 0 };
  if (/Installing collected packages/i.test(line)) return { kind: "installing", phase: "\u5B89\u88C5\u4F9D\u8D56", percent: 90 };
  if (/Successfully installed/i.test(line)) return { kind: "installed", phase: "\u5B8C\u6210", percent: 99 };
  return null;
}
var CLIENT_LOG_LIMIT = 256 * 1024;
function normalizeForPrefix(value) {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function isPathInside(root, child) {
  if (root === "" || child === "") return false;
  const normRoot = normalizeForPrefix(root);
  const normChild = normalizeForPrefix(child);
  if (normChild === normRoot) return true;
  return normChild.startsWith(`${normRoot}/`);
}
async function verifyWorkspaceRoot(ctx, root) {
  if (typeof root !== "string" || root === "") return { ok: false, error: "empty workspace root" };
  let canonical;
  try {
    canonical = await realpath(root);
  } catch {
    return { ok: false, error: "path does not resolve on disk" };
  }
  try {
    for (const workspace of ctx.workspaceRegistry.list()) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, canonical };
    }
  } catch (error) {
    return { ok: false, error: `workspace registry unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: false, error: "path is not inside a registered workspace" };
}
function listWorkspaceRoots(ctx) {
  const roots = [];
  for (const row of workspaceRows(ctx)) {
    const path = [row.path, row.root, row.directory].find((value) => typeof value === "string" && value !== "");
    if (typeof path !== "string") continue;
    const name2 = [row.title, row.name].find((value) => typeof value === "string" && value !== "");
    roots.push({ path, name: typeof name2 === "string" ? name2 : basename(path) });
  }
  return roots;
}
function workspaceRows(ctx) {
  let rows;
  try {
    rows = ctx.workspaceRegistry?.list?.();
  } catch {
    return [];
  }
  return Array.isArray(rows) ? rows.filter((row) => row !== null && typeof row === "object") : [];
}
function findWorkspaceRootForSession(ctx, sessionId, cwd) {
  if (typeof cwd === "string" && cwd !== "") {
    const canonical = (() => {
      try {
        return realpathSync(cwd);
      } catch {
        return "";
      }
    })();
    if (canonical !== "") {
      for (const row of workspaceRows(ctx)) {
        if (typeof row.path === "string" && isPathInside(row.path, canonical)) return row.path;
      }
    }
  }
  if (typeof sessionId !== "string" || sessionId === "") return null;
  const direct = ctx.workspaceRegistry?.sessionPath?.(sessionId);
  if (typeof direct === "string" && direct !== "") return direct;
  const wanted = sessionId.replace(/^session-/, "").toLowerCase();
  for (const row of workspaceRows(ctx)) {
    const ids = row.sessionIds ?? row.sessions;
    const owns = Array.isArray(ids) && ids.some((id) => typeof id === "string" && id.replace(/^session-/, "").toLowerCase() === wanted);
    if (owns && typeof row.path === "string" && row.path !== "") return row.path;
  }
  return null;
}
async function verifyPathInSomeWorkspace(ctx, target) {
  if (typeof target !== "string" || target === "") return { ok: false, error: "empty path" };
  let canonical;
  try {
    canonical = await realpath(target);
  } catch {
    return { ok: false, error: "path does not resolve on disk" };
  }
  try {
    for (const workspace of ctx.workspaceRegistry.list()) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, canonical };
    }
  } catch (error) {
    return { ok: false, error: `workspace registry unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: false, error: "path is not inside a registered workspace" };
}
var INDEX_LIMIT = 60;
var CLASS_PATTERN = /^class\s+([A-Za-z_]\w*)\s*\(\s*([^)]*)\)/gm;
function scanScenes(source) {
  const names = [];
  for (const match of source.matchAll(CLASS_PATTERN)) {
    const bases = match[2];
    if (/\b\w*Scene\b/.test(bases) && !/^SceneBase$/.test(match[1])) names.push(match[1]);
  }
  return [...new Set(names)];
}
function isSceneCandidate(relPath) {
  const parts = relPath.split("/");
  if (parts.some((part) => SKIP_DIRS.has(part))) return false;
  if (!relPath.endsWith(".py")) return false;
  return !/(^|\/)(test_|conftest)/.test(relPath);
}
async function collectCandidates(root, dir, depth, out) {
  if (depth > MAX_SCAN_DEPTH || out.length >= MAX_SCAN_FILES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_SCAN_FILES) return;
    const absolute = join2(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      if (await isLibraryCheckout(absolute, false)) continue;
      await collectCandidates(root, absolute, depth + 1, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = relative(root, absolute).replaceAll("\\", "/");
    if (isSceneCandidate(rel)) out.push(absolute);
  }
}
function sceneKey(absPath) {
  return createHash("sha1").update(normalizeForPrefix(absPath)).digest("hex").slice(0, 16);
}
function workspaceKey(root) {
  return createHash("sha1").update(normalizeForPrefix(root)).digest("hex").slice(0, 16);
}
function safeName(value, fallback = "scene") {
  const cleaned = value.replace(/[^\w.\-]+/g, "_").replace(/^[._]+/, "").slice(0, 80);
  return cleaned === "" ? fallback : cleaned;
}
var ManimService = class {
  /**
   * @param ctx - context carrying the workspace registry.
   * @param config - resolved plugin config.
   * @param engine - the running-job registry.
   */
  constructor(ctx, config, engine) {
    this.ctx = ctx;
    this.config = config;
    this.engine = engine;
  }
  scanCache = /* @__PURE__ */ new Map();
  probeCache = null;
  // --- paths -------------------------------------------------------------
  /** Gate a workspace root: canonicalize it and require registration. */
  async gate(root) {
    return await verifyWorkspaceRoot(this.ctx, root);
  }
  /** The cache directory for one scene at one quality. */
  sceneDir(absPath, qualityId) {
    return join2(this.config.cacheDir, "scenes", sceneKey(absPath), qualityId);
  }
  /** Manim's own working directory (its `media_dir`) for one scene+quality. */
  mediaDir(absPath, qualityId) {
    return join2(this.sceneDir(absPath, qualityId), "manim");
  }
  /** Where stills extracted from a render are written. */
  framesDir(absPath, qualityId) {
    return join2(this.sceneDir(absPath, qualityId), "frames");
  }
  /** The persisted render index for one workspace. */
  indexPath(root) {
    return join2(this.config.cacheDir, "index", `${workspaceKey(root)}.json`);
  }
  // --- scene discovery ---------------------------------------------------
  /**
   * Every scene file under a workspace.
   *
   * Cached for 20 s: the panel polls, and walking a large workspace on every
   * poll is the difference between a snappy tab and a spinning one. The TTL is
   * short enough that a file the agent just wrote shows up on the next refresh
   * without the user pressing anything.
   */
  async listScenes(root, options = {}) {
    const cached = this.scanCache.get(root);
    if (cached !== void 0 && options.refresh !== true && Date.now() - cached.at < 2e4) {
      return cached.entries;
    }
    const renders = await this.readIndex(root);
    const candidates = [];
    await collectCandidates(root, root, 0, candidates);
    const entries = [];
    for (const absolute of candidates) {
      try {
        const info = await stat(absolute);
        if (info.size === 0 || info.size > this.config.maxSceneBytes) continue;
        const source = await readFile(absolute, "utf8");
        const scenes = scanScenes(source);
        if (scenes.length === 0) continue;
        const rel = relative(root, absolute).replaceAll("\\", "/");
        entries.push({
          path: absolute,
          rel,
          dir: dirname2(rel) === "." ? "" : dirname2(rel).replaceAll("\\", "/"),
          size: info.size,
          mtime: info.mtimeMs,
          scenes,
          renders: renders.filter((record) => record.sceneFile === absolute)
        });
      } catch {
      }
    }
    entries.sort((a, b) => b.mtime - a.mtime);
    this.scanCache.set(root, { at: Date.now(), entries });
    return entries;
  }
  /** Drop the scan cache (after the plugin writes a scene file). */
  invalidateScan(root) {
    if (root === void 0) this.scanCache.clear();
    else this.scanCache.delete(root);
  }
  /** Resolve a scene path argument to an absolute path inside a workspace. */
  async resolveScenePath(root, path) {
    const candidate = isAbsolute(path) ? path : resolve(root, path);
    let canonical;
    try {
      canonical = await realpath(candidate);
    } catch {
      return { ok: false, error: `\u627E\u4E0D\u5230\u6587\u4EF6\uFF1A${path}` };
    }
    if (!isPathInside(root, canonical)) return { ok: false, error: `${path} \u4E0D\u5728\u5DE5\u4F5C\u533A ${root} \u5185` };
    if (!canonical.endsWith(".py")) return { ok: false, error: "\u573A\u666F\u6587\u4EF6\u5FC5\u987B\u662F .py" };
    return { ok: true, absolute: canonical };
  }
  /**
   * Resolve a scene path for **writing**, where the file need not exist yet.
   *
   * `resolveScenePath` requires the file to resolve on disk, which is right for
   * reading and rendering and wrong for the first write of a new scene — that
   * version refused to create any file ("找不到文件") and made `manim_scene
   * (action='write')` useless for exactly the case it exists for. Here the
   * parent directory is what has to resolve, and the target still has to land
   * inside the workspace.
   */
  async resolveScenePathForWrite(root, path) {
    const candidate = isAbsolute(path) ? path : resolve(root, path);
    if (!candidate.toLowerCase().endsWith(".py")) return { ok: false, error: "\u573A\u666F\u6587\u4EF6\u5FC5\u987B\u662F .py" };
    if (!isPathInside(root, candidate)) return { ok: false, error: `${path} \u4E0D\u5728\u5DE5\u4F5C\u533A ${root} \u5185` };
    let parent;
    try {
      parent = await realpath(dirname2(candidate));
    } catch {
      return { ok: false, error: `\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${dirname2(candidate)}` };
    }
    const absolute = join2(parent, basename(candidate));
    if (!isPathInside(root, absolute)) return { ok: false, error: `${path} \u89E3\u6790\u540E\u843D\u5728\u5DE5\u4F5C\u533A\u5916` };
    return { ok: true, absolute };
  }
  /**
   * Decide which `Scene` class a render means.
   *
   * Static, so it costs one file read rather than a Python process. The driver
   * repeats the check authoritatively before it renders anything, so a file this
   * scan misreads fails with the driver's own message rather than silently
   * rendering the wrong scene.
   */
  async resolveSceneName(absolute, requested) {
    let source;
    try {
      source = await readFile(absolute, "utf8");
    } catch (error) {
      return { ok: false, error: `\u65E0\u6CD5\u8BFB\u53D6\u573A\u666F\u6587\u4EF6\uFF1A${error instanceof Error ? error.message : String(error)}` };
    }
    const scenes = scanScenes(source);
    if (scenes.length === 0) {
      return { ok: false, error: `\u8FD9\u4E2A\u6587\u4EF6\u91CC\u6CA1\u6709 Scene \u5B50\u7C7B\uFF1A${basename(absolute)}` };
    }
    if (requested !== void 0 && requested !== null && requested !== "") {
      if (!scenes.includes(requested)) {
        return { ok: false, error: `\u6587\u4EF6\u91CC\u6CA1\u6709\u540D\u4E3A ${requested} \u7684\u573A\u666F\uFF1B\u5B83\u5B9A\u4E49\u4E86\uFF1A${scenes.join(", ")}` };
      }
      return { ok: true, scene: requested, scenes };
    }
    if (scenes.length > 1) {
      return { ok: false, error: `\u6587\u4EF6\u91CC\u6709\u591A\u4E2A\u573A\u666F\uFF0C\u8BF7\u6307\u660E scene\uFF1A${scenes.join(", ")}` };
    }
    return { ok: true, scene: scenes[0], scenes };
  }
  /** Ask the driver for the authoritative scene list of one file. */
  async inspectSceneFile(absolute) {
    try {
      const events = await runDriver({
        pythonPath: this.config.pythonPath,
        driverPath: this.config.driverPath,
        spec: { mode: "list", sceneFile: absolute },
        cwd: dirname2(absolute),
        timeoutMs: 9e4
      });
      const result = lastResult(events);
      const scenes = result?.scenes ?? [];
      return { ok: true, scenes };
    } catch (error) {
      return { ok: false, scenes: [], error: error instanceof Error ? error.message : String(error) };
    }
  }
  // --- render index ------------------------------------------------------
  /**
   * Read the persisted render index for a workspace.
   *
   * Every record is checked against the disk and its path repaired when the film
   * can be found again (see `repairRecord`). The path is *persisted*, so a record
   * written by an older driver keeps whatever location that version computed —
   * and that has been wrong here: a draft render was indexed as
   * `…/draft/manim/videos/480p15/UnetrppExplainer.mp4` while the film had always
   * been at `…/draft/manim/videos/UnetrppExplainer/480p15/UnetrppExplainer.mp4`.
   * Repaired on read rather than written back: the index file stays the driver's
   * to own, and the check costs one `stat` per record.
   *
   * A record whose film is really gone is returned as-is — the index is the only
   * note that the render happened, and a caller that opens it gets the file
   * system's error, which says more than "there is no such render".
   */
  async readIndex(root) {
    try {
      const raw = await readFile(this.indexPath(root), "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.renders)) return [];
      return await Promise.all(parsed.renders.map((record) => this.repairRecord(record)));
    } catch {
      return [];
    }
  }
  /**
   * One indexed record, with `video` pointing at the film that is really there.
   *
   * Two candidates, in order of how much they prove:
   *
   * * `output` — the copy publishing wrote into the workspace. `publishRender`
   *   copies the film it has just rendered in the same breath as it writes this
   *   record, so while it is still there it *is* the record's film. It also
   *   outlives the cache being cleaned, which is one way a record loses its
   *   `video`.
   * * a film of the same name in the render's quality directory, for records
   *   whose copy was renamed or deleted, or never made (`outputDir: ''`).
   *
   * Neither is a guess about *content*: both are films of this scene at this
   * quality, and the one the record was written from is preferred over the one
   * merely lying around.
   */
  async repairRecord(record) {
    if (existsSync(record.video)) return record;
    if (record.output !== void 0 && existsSync(record.output)) return { ...record, video: record.output };
    const located = await this.locateVideo(record);
    return located === null ? record : { ...record, video: located };
  }
  /**
   * Find a record's mp4 when the path baked into it does not exist.
   *
   * manim decides where the film goes: `videos/<module>/<quality>/<name>.mp4`,
   * where `module` is the scene *file*'s stem and `name` the scene class. The
   * driver has computed that wrong before — it once left the module level out and
   * indexed `videos/<quality>/<name>.mp4` — and because the path is persisted,
   * such a record never heals by itself.
   *
   * So: look where the driver puts films today, then where it used to. The name
   * is taken from the stale path itself, which is the one thing it gets right,
   * and the search never wanders deeper — an mp4 of the same name can be a
   * leftover film from an earlier revision of the scene (this machine has exactly
   * that, with a different duration and a different mtime).
   */
  async locateVideo(record) {
    const videos = join2(this.sceneDir(record.sceneFile, record.quality), "manim", "videos");
    const name2 = basename(record.video);
    const moduleName = basename(record.sceneFile).replace(/\.[^.]+$/, "");
    return await this.newestUnder(join2(videos, moduleName), name2) ?? await this.newestUnder(videos, name2);
  }
  /**
   * The newest `<dir>/<sub>/<name>` that any subdirectory of `dir` holds, or null.
   *
   * Exactly one level down on purpose: that is the quality folder. Going deeper
   * would reach `partial_movie_files`, which holds one mp4 per animation — the
   * finished film is never among them. When several subdirectories hold the name
   * (qualities, or a film left behind by an older revision), the newest wins: the
   * record was written when its render finished.
   */
  async newestUnder(dir, name2) {
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return null;
    }
    const found = [];
    for (const entry of entries) {
      const file = join2(dir, entry, name2);
      try {
        found.push({ file, at: (await stat(file)).mtimeMs });
      } catch {
      }
    }
    if (found.length === 0) return null;
    found.sort((a, b) => b.at - a.at);
    return found[0].file;
  }
  /** Add one finished render to the index. */
  async rememberRender(root, record) {
    const existing = await this.readIndex(root);
    const key = (item) => `${item.sceneFile}|${item.scene}|${item.quality}`;
    const next = [record, ...existing.filter((item) => key(item) !== key(record))].slice(0, INDEX_LIMIT);
    const file = this.indexPath(root);
    await mkdir(dirname2(file), { recursive: true });
    await writeFile(file, JSON.stringify({ renders: next }, null, 2), "utf8");
  }
  // --- plans -------------------------------------------------------------
  /** The plan cache file (one for the whole plugin, keyed by scene). */
  planFile() {
    return join2(this.config.cacheDir, "index", "plans.json");
  }
  /** Every cached plan. */
  async readPlans() {
    try {
      const parsed = JSON.parse(await readFile(this.planFile(), "utf8"));
      return parsed.plans ?? {};
    } catch {
      return {};
    }
  }
  /**
   * The cached plan for a scene file, if it still matches the file's revision.
   *
   * @param absolute - the scene file.
   * @param scene - the scene class the plan must belong to.
   * @returns the plan, or null when there is none / it is stale.
   */
  async planFor(absolute, scene) {
    const plans = await this.readPlans();
    const record = plans[sceneKey(absolute)];
    if (record === void 0 || record.scene !== scene) return null;
    try {
      const info = await stat(absolute);
      if (info.mtimeMs !== record.mtime || info.size !== record.size) return null;
    } catch {
      return null;
    }
    return record;
  }
  /** Store a measured plan against the scene file's current revision. */
  async rememberPlan(absolute, scene, plays, duration) {
    if (plays <= 0 || duration === null || duration <= 0) return;
    let info;
    try {
      info = await stat(absolute);
    } catch {
      return;
    }
    const plans = await this.readPlans();
    plans[sceneKey(absolute)] = { plays, duration, scene, mtime: info.mtimeMs, size: info.size, at: Date.now() };
    const file = this.planFile();
    await mkdir(dirname2(file), { recursive: true });
    await writeFile(file, JSON.stringify({ plans }, null, 2), "utf8");
  }
  // --- rendering ---------------------------------------------------------
  /** The quality preset for an id, falling back to the configured default. */
  qualityFor(id) {
    return qualityById(id ?? "") ?? qualityById(this.config.defaultQuality) ?? qualityById("1080p60");
  }
  /**
   * Build the driver spec for a render.
   *
   * When a plan is already cached for this scene revision the driver is told to
   * skip its own plan pass and handed the numbers instead — same progress bar,
   * same pre-flight guarantees already spent, ~58 s saved on a large scene.
   *
   * @param absolute - the scene file.
   * @param scene - the scene class.
   * @param quality - the quality preset.
   * @param plan - a cached plan, or null to let the driver measure one.
   * @param encoders - how many segments may encode concurrently.
   */
  renderSpec(absolute, scene, quality, plan, encoders) {
    return {
      mode: "render",
      sceneFile: absolute,
      sceneName: scene,
      mediaDir: this.mediaDir(absolute, quality.id),
      outputName: safeName(scene),
      width: quality.width,
      height: quality.height,
      fps: quality.fps,
      background: this.config.background,
      format: "mp4",
      encoders,
      plan: plan === null,
      ...plan === null ? {} : { totalPlays: plan.plays, totalDuration: plan.duration }
    };
  }
  /**
   * Start a render.
   *
   * @param input - workspace root, scene file (absolute), scene class, quality.
   * @returns the job handle the panel polls.
   */
  async startRender(input) {
    const cached = input.plan === false ? null : await this.planFor(input.path, input.scene);
    const usePlan = input.plan === true ? null : cached;
    return this.engine.start(
      this.renderSpec(
        input.path,
        input.scene,
        input.quality,
        usePlan,
        this.config.maxInflightEncoders
      ),
      {
        root: input.root,
        path: input.path,
        scene: input.scene,
        quality: input.quality.id,
        origin: input.origin
      }
    );
  }
  /**
   * Copy a finished render into the workspace and record it.
   *
   * The copy exists because the cache is a cache — it can be pruned, and it is
   * not somewhere the user would think to look for the video they just made.
   */
  async publishRender(root, job) {
    if (job.result === null) return null;
    if (job.published) return null;
    job.published = true;
    const record = {
      sceneFile: job.path,
      scene: job.scene ?? basename(job.path, ".py"),
      quality: job.quality,
      video: job.result.video,
      duration: job.result.duration,
      plays: job.result.plays,
      width: job.result.width,
      height: job.result.height,
      fps: job.result.fps,
      at: Date.now()
    };
    if (this.config.outputDir !== "") {
      try {
        const targetDir = join2(root, this.config.outputDir);
        await mkdir(targetDir, { recursive: true });
        const target = join2(targetDir, `${safeName(record.scene)}-${job.quality}.mp4`);
        const bytes = await readFile(job.result.video);
        await writeFile(target, bytes);
        record.output = target;
        job.result.output = target;
      } catch (error) {
        job.log.push(`[warn] \u590D\u5236\u5230\u5DE5\u4F5C\u533A\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await this.rememberRender(root, record);
    await this.rememberPlan(job.path, record.scene, record.plays, record.duration);
    this.invalidateScan(root);
    return record;
  }
  /** Wait for a job to reach a terminal state (used by the tools). */
  async waitFor(jobId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (; ; ) {
      const job = this.engine.get(jobId);
      if (job === void 0) return null;
      if (job.endedAt !== null) {
        if (job.state === "done" && job.result !== null) await this.publishRender(job.root, job);
        return this.engine.get(jobId) ?? job;
      }
      if (Date.now() > deadline) return job;
      await new Promise((resolve4) => setTimeout(resolve4, 250));
    }
  }
  // --- stills ------------------------------------------------------------
  /**
   * Extract stills from a rendered video.
   *
   * The times are the interesting part: evenly spaced samples are what the panel
   * puts under the player as a storyboard, and they are also how the model looks
   * at its own output without watching it — an agent that can see four frames of
   * the animation it just made catches the mistakes (overlapping labels, text
   * off the frame, a missed fade) that a "rendered successfully" line hides.
   */
  async storyboard(input) {
    const outDir = this.framesDir(input.keyPath, input.qualityId);
    await mkdir(outDir, { recursive: true });
    const times = input.times ?? [];
    const events = await runDriver({
      pythonPath: this.config.pythonPath,
      driverPath: this.config.driverPath,
      spec: {
        mode: "frames",
        video: input.video,
        times,
        count: times.length === 0 ? input.count ?? 6 : 0,
        outDir,
        frameWidth: input.width ?? 0
      },
      timeoutMs: 12e4
    });
    const result = lastResult(events);
    return result?.frames ?? [];
  }
  // --- scaffolding -------------------------------------------------------
  /** The bundled starter scene template. */
  starterTemplate() {
    const file = fileURLToPath2(new URL("../templates/starter.py", import.meta.url));
    return file;
  }
  /**
   * Write a new scene file from the bundled template.
   *
   * @param root - workspace root.
   * @param name - file stem and default scene class name.
   * @param dir - workspace-relative directory; defaults to `animations`.
   */
  async scaffold(root, name2, dir = "animations") {
    const fileName = `${safeName(name2)}.py`;
    const targetDir = resolve(root, dir === "" ? "." : dir);
    if (!isPathInside(root, targetDir)) throw new Error("\u76EE\u6807\u76EE\u5F55\u4E0D\u5728\u5DE5\u4F5C\u533A\u5185");
    await mkdir(targetDir, { recursive: true });
    const target = join2(targetDir, fileName);
    if (existsSync(target)) throw new Error(`\u6587\u4EF6\u5DF2\u5B58\u5728\uFF1A${relative(root, target).replaceAll("\\", "/")}`);
    const sceneClass = safeClassName(name2);
    const template = await readFile(this.starterTemplate(), "utf8");
    await writeFile(target, template.replaceAll("__SCENE_CLASS__", sceneClass), "utf8");
    this.invalidateScan(root);
    return { path: target, scene: sceneClass };
  }
  // --- narration ---------------------------------------------------------
  /**
   * Which text-to-speech engines work here, and what voices they offer.
   *
   * `edge` is Microsoft Edge's read-aloud service through the `edge-tts`
   * package: free, no API key, and its Chinese voices are close to human.
   * `sapi` is Windows' own offline synthesiser — robotic, but it works with the
   * network down, which is the difference between "narrated draft" and "no
   * narration at all". The panel and the tool both ask here rather than
   * hard-coding a voice name.
   */
  async voiceInventory() {
    const events = await runPythonSpec({
      pythonPath: this.config.pythonPath,
      scriptPath: this.config.voicePath,
      spec: { mode: "list" },
      timeoutMs: 12e4
    });
    const result = lastResult(events) ?? {};
    return {
      engines: result.engines ?? {},
      voices: result.voices ?? [],
      errors: result.errors ?? []
    };
  }
  /**
   * Synthesise narration lines and write a cue sheet beside them.
   *
   * The cue sheet is the point: it carries each line's absolute start offset, so
   * the scene never has to reconstruct a timeline from durations by hand (a
   * scene that gets that arithmetic wrong drifts a second behind the voice by
   * the end, and nothing in the render reports it).
   *
   * @param input - workspace, output directory, lines, engine and voice.
   */
  async speak(input) {
    const outDir = resolve(input.root, input.dir === "" ? "." : input.dir);
    if (!isPathInside(input.root, outDir)) throw new Error("\u76EE\u6807\u76EE\u5F55\u4E0D\u5728\u5DE5\u4F5C\u533A\u5185");
    await mkdir(outDir, { recursive: true });
    const events = await runPythonSpec({
      pythonPath: this.config.pythonPath,
      scriptPath: this.config.voicePath,
      spec: {
        mode: "speak",
        outDir,
        lines: input.lines,
        gap: input.gap ?? 0.35,
        ...input.voice === void 0 ? {} : { voice: input.voice },
        ...input.rate === void 0 ? {} : { rate: input.rate },
        ...input.engine === void 0 ? {} : { engine: input.engine }
      },
      // From the workspace: a relative `outDir` in the spec is not used (we pass
      // an absolute one), but a project-local config should still apply.
      cwd: input.root,
      timeoutMs: 15 * 6e4
    });
    const result = lastResult(events);
    if (result === null) throw new Error("\u8BED\u97F3\u5408\u6210\u6CA1\u6709\u8FD4\u56DE\u7ED3\u679C");
    const sheet = typeof result.sheet === "string" ? result.sheet : "";
    return {
      ...result,
      sheetRel: sheet === "" ? "" : relative(input.root, sheet).split(sep).join("/"),
      filesRel: (result.files ?? []).map((file) => relative(input.root, String(file.path)).split(sep).join("/"))
    };
  }
  // --- runtime probe -----------------------------------------------------
  /** Whether the bundled runtime is usable, cached for a minute. */
  /**
   * Finished films sitting in the workspace, whether or not this plugin made them.
   *
   * The render index only knows about jobs *this* installation ran. A workspace
   * that already contains `animations/*.mp4` — produced by another DSH home, a
   * previous install, or by hand — is exactly what a user expects to find in the
   * 文件 menu, so the list is built from the disk, not from the index.
   *
   * @param root - the canonical workspace root.
   * @returns films newest first.
   */
  async scanVideos(root) {
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    const collect = async (dir) => {
      let names;
      try {
        names = (await readdir(dir)).filter((name2) => VIDEO_FILE.test(name2));
      } catch {
        return;
      }
      for (const name2 of names) {
        const abs = join2(dir, name2);
        if (seen.has(abs)) continue;
        seen.add(abs);
        try {
          const info = await stat(abs);
          if (!info.isFile()) continue;
          found.push({ rel: relative(root, abs).replaceAll(String.fromCharCode(92), "/"), name: name2, at: info.mtimeMs, size: info.size });
        } catch {
        }
      }
    };
    await collect(join2(root, this.config.outputDir));
    const walk = async (dir, depth) => {
      if (depth > 3) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        const child = join2(dir, entry.name);
        await collect(child);
        await walk(child, depth + 1);
      }
    };
    await walk(root, 1);
    return found.sort((a, b) => b.at - a.at);
  }
  /** Live state of the renderer installation, one at a time. */
  setupJob = null;
  /**
   * Start building the render runtime, reporting progress as it goes.
   *
   * The venv is ~500 MB of Python, so a click that appears to do nothing for ten
   * minutes is indistinguishable from a hang. The host parses pip's own output
   * for the stage and the number of packages resolved, and the panel renders a
   * bar from it.
   *
   * The venv is built into `config.runtimeDir`, which lives *outside* the package
   * when the plugin is installed as a dependency — reinstalling the plugin must
   * not throw the renderer away.
   *
   * @returns the job id the panel polls.
   */
  async startRuntimeSetup() {
    if (this.setupJob?.running === true) return { id: this.setupJob.id };
    const script = join2(PLUGIN_ROOT, "runtime", "setup-runtime.mjs");
    const venv = join2(this.config.runtimeDir, "venv");
    const job = {
      id: randomUUID2(),
      startedAt: Date.now(),
      phase: "\u51C6\u5907",
      collected: 0,
      percent: 2,
      tail: "",
      running: true,
      ok: false,
      error: ""
    };
    this.setupJob = job;
    if (!existsSync(script)) {
      Object.assign(job, { running: false, phase: "\u5931\u8D25", error: `missing ${script}`, percent: 100 });
      return { id: job.id };
    }
    const child = spawn2(process.execPath, [script, "--venv", venv], { cwd: PLUGIN_ROOT, windowsHide: true });
    const feed = (chunk) => {
      const text = String(chunk);
      job.tail = (job.tail + text).slice(-2e3);
      for (const line of text.split(String.fromCharCode(10))) {
        const step = parseSetupProgress(line);
        if (step === null) continue;
        if (step.kind === "collecting") {
          job.collected += 1;
          job.phase = step.phase;
          job.percent = Math.max(job.percent, Math.min(84, 20 + job.collected));
        } else {
          job.phase = step.phase;
          job.percent = Math.max(job.percent, step.percent);
        }
      }
    };
    child.stdout?.on("data", feed);
    child.stderr?.on("data", feed);
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
      }
    }, 40 * 60 * 1e3);
    await new Promise((resolve4) => {
      child.on("close", () => {
        clearTimeout(timer);
        resolve4();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        job.error = error.message;
        resolve4();
      });
    });
    const probe = await this.probe(true);
    job.running = false;
    job.percent = 100;
    job.ok = probe.pythonPresent === true;
    job.phase = job.ok ? "\u5B8C\u6210" : "\u5931\u8D25";
    if (!job.ok && job.error === "") job.error = String(probe.error ?? "\u8FD0\u884C\u65F6\u88C5\u4E0D\u4E0A");
    return { id: job.id };
  }
  /** The current renderer-install job, for the panel's progress bar. */
  runtimeSetupStatus() {
    const job = this.setupJob;
    if (job === null) return { state: "idle" };
    return {
      state: job.running ? "running" : job.ok ? "done" : "failed",
      phase: job.phase,
      percent: job.percent,
      collected: job.collected,
      elapsedMs: Date.now() - job.startedAt,
      tail: job.tail.slice(-600),
      error: job.error,
      venvDir: join2(this.config.runtimeDir, "venv")
    };
  }
  /**
   * Append a browser-side failure to a file next to the render cache.
   *
   * Written for one reason: when the panel is what breaks, the renderer console is
   * not reachable, and "nothing showed up" is not a report. The file is bounded by
   * truncating from the head.
   *
   * @param entry - the failure the panel reported.
   */
  async appendClientLog(entry) {
    const line = JSON.stringify({
      at: (/* @__PURE__ */ new Date()).toISOString(),
      where: typeof entry.where === "string" ? entry.where : "",
      message: typeof entry.message === "string" ? entry.message : String(entry.message ?? ""),
      stack: typeof entry.stack === "string" ? entry.stack.slice(0, 4e3) : ""
    }) + String.fromCharCode(10);
    const file = join2(this.config.cacheDir, "client-failures.log");
    try {
      await mkdir(this.config.cacheDir, { recursive: true });
      await appendFile(file, line, "utf8");
      const size = (await stat(file)).size;
      if (size > CLIENT_LOG_LIMIT) {
        const kept = (await readFile(file, "utf8")).slice(-Math.floor(CLIENT_LOG_LIMIT / 2));
        await writeFile(file, kept, "utf8");
      }
    } catch {
    }
  }
  async probe(force = false) {
    if (!force && this.probeCache !== null && Date.now() - this.probeCache.at < 6e4) {
      return this.probeCache.value;
    }
    const base = {
      pythonPath: this.config.pythonPath,
      pythonPresent: existsSync(this.config.pythonPath),
      driverPath: this.config.driverPath,
      driverPresent: existsSync(this.config.driverPath),
      cacheDir: this.config.cacheDir,
      pluginRoot: PLUGIN_ROOT,
      // Shown in the panel so a user who uninstalls knows what to delete: the
      // renderer (~500 MB) and the render cache both live outside the workspace.
      venvDir: join2(this.config.runtimeDir, "venv"),
      runtimeDir: this.config.runtimeDir
    };
    if (!base.pythonPresent) {
      const value = {
        ok: false,
        ...base,
        error: "\u8FD0\u884C\u65F6\u8FD8\u6CA1\u88C5\u597D\uFF1A\u8DD1 node runtime/setup-runtime.mjs \u5EFA\u5B83\u3002\u5982\u679C\u5DF2\u7ECF\u88C5\u8FC7\u4F46\u516C\u5F0F/\u6E32\u67D3\u62A5\u4F9D\u8D56\u9519\uFF0C\u8DD1 node runtime/setup-runtime.mjs --repair\u3002\u4E0D\u8981\u76F4\u63A5\u5F80\u8FD9\u4E2A venv \u91CC pip install \u2014\u2014 \u9489\u4F4F\u7684\u7248\u672C\u5199\u5728\u90A3\u4E2A\u811A\u672C\u91CC\u3002"
      };
      this.probeCache = { at: Date.now(), value };
      return value;
    }
    try {
      const events = await runDriver({
        pythonPath: this.config.pythonPath,
        driverPath: this.config.driverPath,
        spec: { mode: "probe" },
        timeoutMs: 12e4
      });
      const result = lastResult(events);
      const value = { ...base, ...result ?? {}, ok: result?.ok !== false };
      this.probeCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      const value = { ok: false, ...base, error: error instanceof Error ? error.message : String(error) };
      this.probeCache = { at: Date.now(), value };
      return value;
    }
  }
};
function lastResult(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].ev === "result") return events[index];
  }
  return null;
}
function safeClassName(value) {
  const parts = value.split(/[^A-Za-z0-9]+/).filter((part) => part !== "");
  const joined = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const cleaned = joined.replace(/^[^A-Za-z_]+/, "");
  return cleaned === "" ? "Explainer" : cleaned.slice(0, 60);
}

// src/routes.ts
import { createReadStream } from "node:fs";
import { stat as stat2 } from "node:fs/promises";
import { extname, isAbsolute as isAbsolute2, resolve as resolve2 } from "node:path";
var BAD_REQUEST = { code: "invalid", message: "malformed request" };
function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}
async function readJsonBody(req, limit = 1 << 20) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    chunks.push(buffer);
    total += buffer.length;
    if (total > limit) return null;
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function strField(payload, key) {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload[key];
  return typeof value === "string" && value !== "" ? value : null;
}
function strOrEmpty(payload, key) {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload[key];
  return typeof value === "string" ? value : null;
}
function intField(payload, key) {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) return Math.round(Number(value));
  return null;
}
function json(res, envelope, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(envelope));
}
function fail(res, code, message) {
  const status = code === "workspace" ? 403 : code === "not-found" ? 404 : code === "invalid" ? 422 : code === "busy" ? 409 : 500;
  json(res, { ok: false, error: { code, message } }, status);
}
function jobView(job) {
  return {
    id: job.id,
    path: job.path,
    scene: job.scene,
    quality: job.quality,
    state: job.state,
    progress: job.progress,
    log: job.log.slice(-120),
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    result: job.result,
    error: job.error,
    frames: job.frames,
    origin: job.origin
  };
}
async function serveFile(req, res, file, contentType) {
  let size;
  try {
    const info = await stat2(file);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    size = info.size;
  } catch {
    res.writeHead(404);
    res.end();
    return;
  }
  const range = req.headers.range;
  const headers = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "cache-control": "no-cache"
  };
  if (typeof range === "string") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match !== null) {
      const start = match[1] === "" ? Math.max(0, size - Number(match[2])) : Number(match[1]);
      const end = match[1] === "" || match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < size) {
        res.writeHead(206, {
          ...headers,
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": String(end - start + 1)
        });
        createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(416, { "content-range": `bytes */${size}` });
      res.end();
      return;
    }
  }
  res.writeHead(200, { ...headers, "content-length": String(size) });
  createReadStream(file).pipe(res);
}
var MIME = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".gif": "image/gif",
  ".png": "image/png"
};
function registerManimRoutes(ctx, service, engine, config) {
  const handler = async (req, res) => {
    if (!isLoopbackRequest(req)) {
      json(res, { ok: false, error: { code: "forbidden", message: "loopback-only" } }, 403);
      return;
    }
    if (req.method !== "POST" && req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET") {
      switch (url.pathname) {
        case "/dsh-manim/video": {
          const id = url.searchParams.get("id");
          let file = null;
          if (id !== null) {
            file = engine.get(id)?.result?.video ?? null;
          } else {
            const root = url.searchParams.get("root") ?? "";
            const path = url.searchParams.get("path") ?? "";
            const quality = url.searchParams.get("quality") ?? "";
            const scene = url.searchParams.get("scene") ?? "";
            const gate = await service.gate(root);
            if (!gate.ok) {
              fail(res, "workspace", gate.error);
              return;
            }
            const records = await service.readIndex(gate.canonical);
            const record = records.find(
              (item) => item.sceneFile === path && item.quality === quality && (scene === "" || item.scene === scene)
            );
            file = record?.video ?? null;
          }
          if (file === null) {
            const root = url.searchParams.get("root") ?? "";
            const rel = url.searchParams.get("file") ?? "";
            if (root !== "" && rel !== "") {
              const gate = await service.gate(root);
              if (gate.ok) {
                const candidate = isAbsolute2(rel) ? rel : resolve2(gate.canonical, rel);
                const inside = isPathInside(gate.canonical, candidate);
                const video = /\.(mp4|webm|mov|m4v)$/i.test(candidate);
                if (inside && video) file = candidate;
              }
            }
          }
          if (file === null) {
            res.writeHead(404);
            res.end();
            return;
          }
          await serveFile(req, res, file, MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
          return;
        }
        case "/dsh-manim/frame": {
          const file = url.searchParams.get("file") ?? "";
          const cache = resolve2(config.cacheDir);
          if (file === "" || !isPathInside(cache, resolve2(file))) {
            res.writeHead(403);
            res.end();
            return;
          }
          await serveFile(req, res, resolve2(file), MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
          return;
        }
        default:
          res.writeHead(404);
          res.end();
          return;
      }
    }
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      fail(res, "invalid", "content-type must be application/json");
      return;
    }
    const payload = await readJsonBody(req);
    if (payload === null) {
      fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
      return;
    }
    switch (url.pathname) {
      case "/dsh-manim/list": {
        const root = strField(payload, "root");
        if (root === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
          return;
        }
        const gate = await service.gate(root);
        if (!gate.ok) {
          fail(res, "workspace", gate.error);
          return;
        }
        const scenes = await service.listScenes(gate.canonical, { refresh: payload.refresh === true });
        json(res, {
          ok: true,
          value: {
            videos: await service.scanVideos(gate.canonical),
            root: gate.canonical,
            scenes,
            jobs: engine.list().filter((job) => job.root === gate.canonical).map(jobView),
            qualities: QUALITIES,
            defaultQuality: config.defaultQuality,
            background: config.background,
            outputDir: config.outputDir
          }
        });
        return;
      }
      case "/dsh-manim/inspect": {
        const root = strField(payload, "root");
        const path = strField(payload, "path");
        if (root === null || path === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
          return;
        }
        const gate = await service.gate(root);
        if (!gate.ok) {
          fail(res, "workspace", gate.error);
          return;
        }
        const target = await service.resolveScenePath(gate.canonical, path);
        if (!target.ok) {
          fail(res, "invalid", target.error);
          return;
        }
        const inspected = await service.inspectSceneFile(target.absolute);
        if (!inspected.ok) {
          fail(res, "invalid", inspected.error ?? "\u65E0\u6CD5\u89E3\u6790\u573A\u666F\u6587\u4EF6");
          return;
        }
        json(res, { ok: true, value: { path: target.absolute, scenes: inspected.scenes } });
        return;
      }
      case "/dsh-manim/render": {
        const root = strField(payload, "root");
        const path = strField(payload, "path");
        if (root === null || path === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
          return;
        }
        const gate = await service.gate(root);
        if (!gate.ok) {
          fail(res, "workspace", gate.error);
          return;
        }
        const target = await service.resolveScenePath(gate.canonical, path);
        if (!target.ok) {
          fail(res, "invalid", target.error);
          return;
        }
        const requestedScene = strField(payload, "scene");
        const resolved = await service.resolveSceneName(target.absolute, requestedScene);
        if (!resolved.ok) {
          fail(res, "invalid", resolved.error);
          return;
        }
        const running = engine.list().find((job2) => job2.root === gate.canonical && job2.path === target.absolute && job2.endedAt === null);
        if (running !== void 0) {
          fail(res, "busy", `\u8FD9\u4E2A\u573A\u666F\u5DF2\u7ECF\u5728\u6E32\u67D3\u4E2D\uFF08${running.scene ?? ""}\uFF09\uFF0C\u5148\u53D6\u6D88\u6216\u7B49\u5B83\u7ED3\u675F`);
          return;
        }
        const quality = service.qualityFor(strField(payload, "quality"));
        const job = await service.startRender({
          root: gate.canonical,
          path: target.absolute,
          scene: resolved.scene,
          quality,
          origin: "panel"
        });
        json(res, { ok: true, value: { job: jobView(job) } });
        return;
      }
      case "/dsh-manim/job": {
        const id = strField(payload, "id");
        if (id === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
          return;
        }
        const job = engine.get(id);
        if (job === void 0) {
          fail(res, "not-found", "\u8FD9\u4E2A\u4EFB\u52A1\u5DF2\u7ECF\u4E0D\u5728\u4E86\uFF08DSH \u91CD\u542F\u4F1A\u6E05\u7A7A\u4EFB\u52A1\uFF0C\u4F46\u89C6\u9891\u6587\u4EF6\u8FD8\u5728\uFF09");
          return;
        }
        if (job.state === "done" && job.result !== null && !job.published) {
          await service.publishRender(job.root, job);
        }
        json(res, { ok: true, value: { job: jobView(job) } });
        return;
      }
      case "/dsh-manim/cancel": {
        const id = strField(payload, "id");
        if (id === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
          return;
        }
        const cancelled = engine.cancel(id);
        json(res, { ok: true, value: { cancelled } });
        return;
      }
      case "/dsh-manim/forget": {
        const id = strField(payload, "id");
        if (id === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
          return;
        }
        json(res, { ok: true, value: { forgotten: engine.forget(id) } });
        return;
      }
      case "/dsh-manim/storyboard": {
        const id = strField(payload, "id");
        const root = strField(payload, "root");
        const count = Math.max(2, Math.min(24, intField(payload, "count") ?? 6));
        const width = Math.max(120, Math.min(1920, intField(payload, "width") ?? 480));
        let video = null;
        let keyPath = null;
        let qualityId = "";
        if (id !== null) {
          const job = engine.get(id);
          if (job === void 0 || job.result === null) {
            fail(res, "not-found", "\u8FD9\u4E2A\u4EFB\u52A1\u8FD8\u6CA1\u6709\u6E32\u67D3\u7ED3\u679C");
            return;
          }
          video = job.result.video;
          keyPath = job.path;
          qualityId = job.quality;
        } else if (root !== null) {
          const gate = await service.gate(root);
          if (!gate.ok) {
            fail(res, "workspace", gate.error);
            return;
          }
          const path = strField(payload, "path");
          const quality = strField(payload, "quality");
          const scene = strField(payload, "scene");
          if (path === null || quality === null) {
            fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
            return;
          }
          const records = await service.readIndex(gate.canonical);
          const record = records.find(
            (item) => item.sceneFile === path && item.quality === quality && (scene === null || item.scene === scene)
          );
          if (record === void 0) {
            fail(res, "not-found", "\u8FD8\u6CA1\u6709\u8FD9\u4E2A\u573A\u666F\u5728\u8BE5\u753B\u8D28\u4E0B\u7684\u6E32\u67D3\u7ED3\u679C");
            return;
          }
          video = record.video;
          keyPath = record.sceneFile;
          qualityId = record.quality;
        }
        if (video === null || keyPath === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
          return;
        }
        try {
          const frames = await service.storyboard({ video, keyPath, qualityId, count, width });
          if (id !== null) engine.setFrames(id, frames);
          json(res, { ok: true, value: { frames, video } });
        } catch (error) {
          fail(res, "failed", error instanceof Error ? error.message : String(error));
        }
        return;
      }
      case "/dsh-manim/template": {
        const root = strField(payload, "root");
        if (root === null) {
          fail(res, BAD_REQUEST.code, BAD_REQUEST.message);
          return;
        }
        const gate = await service.gate(root);
        if (!gate.ok) {
          fail(res, "workspace", gate.error);
          return;
        }
        try {
          const created = await service.scaffold(
            gate.canonical,
            strField(payload, "name") ?? "Explainer",
            strOrEmpty(payload, "dir") ?? "animations"
          );
          json(res, {
            ok: true,
            value: { ...created, rel: created.path.slice(gate.canonical.length + 1).replaceAll("\\", "/") }
          });
        } catch (error) {
          fail(res, "failed", error instanceof Error ? error.message : String(error));
        }
        return;
      }
      case "/dsh-manim/runtime/setup-status": {
        json(res, { ok: true, value: service.runtimeSetupStatus() });
        return;
      }
      case "/dsh-manim/runtime/setup": {
        try {
          json(res, { ok: true, value: await service.startRuntimeSetup() });
        } catch (error) {
          fail(res, "failed", error instanceof Error ? error.message : String(error));
        }
        return;
      }
      case "/dsh-manim/client-log": {
        try {
          await service.appendClientLog(payload);
        } catch {
        }
        json(res, { ok: true, value: { logged: true } });
        return;
      }
      case "/dsh-manim/session-root": {
        const { sessionId, cwd } = payload;
        const path = findWorkspaceRootForSession(
          ctx,
          typeof sessionId === "string" ? sessionId : "",
          typeof cwd === "string" ? cwd : void 0
        );
        json(res, { ok: true, value: { path } });
        return;
      }
      case "/dsh-manim/workspaces": {
        json(res, { ok: true, value: { roots: listWorkspaceRoots(ctx) } });
        return;
      }
      case "/dsh-manim/probe": {
        json(res, { ok: true, value: await service.probe(payload.force === true) });
        return;
      }
      default:
        res.writeHead(404);
        res.end();
    }
  };
  const dispose = ctx.webServer.register({ kind: "prefix", path: "/dsh-manim", handler });
  return () => dispose();
}

// src/skills.ts
import { readFileSync } from "node:fs";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var BUNDLED_SKILLS = ["manim-explainer"];
function parseSkillMarkdown(raw) {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fm) throw new Error("SKILL.md has no frontmatter block");
  const block = fm[1].match(/^description:\s*>\s*\r?\n((?:[ \t]+.*\r?\n?)+)/m);
  let description;
  if (block !== null) {
    description = block[1].split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "").join(" ");
  } else {
    const hit = fm[1].match(/^description:\s*(.+)$/m);
    description = hit === null ? void 0 : hit[1].trim().replace(/^["']|["']$/g, "");
  }
  if (!description) throw new Error("SKILL.md frontmatter has no description");
  const name2 = fm[1].match(/^name:\s*(.+)$/m);
  return {
    name: name2 === null ? void 0 : name2[1].trim().replace(/^["']|["']$/g, ""),
    description,
    body: raw.slice(fm[0].length).trim()
  };
}
function registerBundledSkills(scope) {
  for (const dir of BUNDLED_SKILLS) {
    try {
      const file = new URL(`../skills/${dir}/SKILL.md`, import.meta.url);
      const parsed = parseSkillMarkdown(readFileSync(file, "utf8"));
      scope.skills.register({
        name: parsed.name ?? dir,
        description: parsed.description,
        source: "bundled",
        content: parsed.body,
        path: fileURLToPath3(file),
        // Lets the skill's own relative paths resolve from the skill body.
        resourceBase: { kind: "directory", path: fileURLToPath3(new URL(`../skills/${dir}/`, import.meta.url)) }
      });
    } catch (error) {
      console.error(`[dsh-manim] skill "${dir}" registration skipped: ${String(error)}`);
    }
  }
}

// src/tools.ts
import { spawn as spawn3 } from "node:child_process";
import { readFile as readFile2, writeFile as writeFile2 } from "node:fs/promises";
import { basename as basename2, dirname as dirname3, isAbsolute as isAbsolute3, relative as relative2, resolve as resolve3 } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
var RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", required: true },
    action: { type: "string", required: true },
    summary: { type: "string", required: true },
    detail: { type: "string", required: true },
    files: { type: "array", items: { type: "string" }, required: true },
    error: { type: "string" }
  }
};
function sessionCwd(ctx) {
  try {
    const sessions = ctx.sessions.list();
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      const session = sessions[i];
      const cwd = session.meta?.cwd ?? session.cwd;
      if (typeof cwd === "string" && cwd !== "") return cwd;
    }
  } catch {
  }
  return "";
}
function resolvePathArg(ctx, path) {
  if (path === void 0 || path === "") return "";
  if (isAbsolute3(path)) return path;
  const cwd = sessionCwd(ctx);
  return cwd === "" ? "" : resolve3(cwd, path);
}
function rootFor(ctx, root) {
  return root !== void 0 && root !== "" ? resolve3(root) : sessionCwd(ctx);
}
function humanDuration(seconds) {
  if (seconds === null || !Number.isFinite(seconds)) return "\u672A\u77E5";
  if (seconds < 60) return `${seconds.toFixed(1)} \u79D2`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return `${minutes} \u5206 ${rest} \u79D2`;
}
function describeScene(entry, root) {
  const latest = entry.renders[0];
  const stamp = latest === void 0 ? "\u672A\u6E32\u67D3" : `\u5DF2\u6E32\u67D3 ${latest.quality} \xB7 ${humanDuration(latest.duration)}`;
  const relativePath = relative2(root, entry.path).replaceAll("\\", "/");
  return `${relativePath} \u2014 ${entry.scenes.join(", ")} \xB7 ${stamp}`;
}
async function syntaxCheck(config, file) {
  const probe = 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), filename=sys.argv[1])';
  return await new Promise((resolvePromise) => {
    const child = spawn3(config.pythonPath, ["-c", probe, file], {
      cwd: dirname3(file),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolvePromise({ ok: false, message: `\u65E0\u6CD5\u8FD0\u884C Python\uFF1A${error.message}` }));
    child.on("close", (code) => {
      resolvePromise(code === 0 ? { ok: true, message: "" } : { ok: false, message: stderr.trim().slice(-1200) });
    });
  });
}
function jobReport(job) {
  const lines = [];
  const result = job.result;
  if (result !== null) {
    lines.push(`\u89C6\u9891\uFF1A${result.output ?? result.video}`);
    if (result.output !== void 0) lines.push(`\uFF08\u7F13\u5B58\u526F\u672C\uFF1A${result.video}\uFF09`);
    lines.push(
      `\u753B\u8D28\uFF1A${result.width}\xD7${result.height} @ ${result.fps}fps \xB7 \u65F6\u957F ${humanDuration(result.duration)} \xB7 ${result.plays} \u6BB5\u52A8\u753B`
    );
  }
  if (job.log.length > 0) {
    const interesting = job.log.filter((line) => /error|warning|Error|Warning|Traceback|failed/i.test(line) || line.startsWith("[warn]") || line.startsWith("[error]")).slice(-12);
    if (interesting.length > 0) {
      lines.push("\u65E5\u5FD7\u8981\u70B9\uFF1A");
      lines.push(...interesting.map((line) => `  ${line}`));
    }
  }
  return lines.join("\n");
}
function sceneTool(ctx, service, config) {
  return defineTool({
    name: "manim_scene",
    description: [
      "[dsh-manim] Scene files for Manim explainer animations \u2014 list, read, write, and scaffold.",
      "action='list': every scene file in the workspace, with its Scene classes and whether it has been rendered.",
      "action='read': the full source of one scene file (use this before editing it).",
      "action='write': create or replace a scene file with the given source. Runs a syntax check and returns any error with its line number \u2014 a scene that does not compile cannot be rendered.",
      "action='template': scaffold a new scene file from the bundled starter (a working example with the house theme, captions and a formula). Do this FIRST for a new video instead of writing a scene from scratch.",
      "action='env': what this machine's Manim runtime can do (version, whether LaTeX is available, quality presets).",
      "Conventions: put scene files under `animations/`. Import `from manimkit import *` for the house theme (`text()`, `caption()`, `panel()`, `chip()`, `arrow()`, `section_title()`, `mathtex()`)."
    ].join("\n"),
    parameters: {
      action: { type: "string", enum: ["list", "read", "write", "template", "env"], description: "What to do", required: true },
      path: { type: "string", description: "Scene file path (absolute or workspace-relative). Required for read/write." },
      scene: { type: "string", description: "Scene class name, for a file that defines several" },
      source: { type: "string", description: "Python source, for action=write" },
      name: { type: "string", description: "For action=template: file name and scene class name" },
      dir: { type: "string", description: "For action=template: workspace-relative directory (default 'animations')" },
      root: { type: "string", description: "Workspace root; defaults to the session workspace" }
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: "text", text: value.detail }]
    },
    async execute(args) {
      const input = args;
      const action = input.action ?? "list";
      const root = rootFor(ctx, input.root);
      if (root === "") {
        return fail2(action, "\u65E0\u6CD5\u786E\u5B9A\u5DE5\u4F5C\u533A\uFF1A\u6CA1\u6709\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u8BF7\u663E\u5F0F\u4F20 root");
      }
      const gate = await service.gate(root);
      if (!gate.ok) return fail2(action, gate.error);
      if (action === "list") {
        const scenes = await service.listScenes(gate.canonical);
        if (scenes.length === 0) {
          return {
            ok: true,
            action,
            summary: "\u5DE5\u4F5C\u533A\u91CC\u8FD8\u6CA1\u6709\u573A\u666F\u6587\u4EF6",
            detail: `\u5DE5\u4F5C\u533A ${gate.canonical} \u91CC\u6CA1\u6709\u627E\u5230 Scene \u5B50\u7C7B\u3002
\u7528 manim_scene(action='template', name='MyExplainer') \u8D77\u4E00\u4E2A\u5E26\u4E3B\u9898\u548C\u5B57\u5E55\u7684\u8D77\u59CB\u573A\u666F\u3002`,
            files: []
          };
        }
        return {
          ok: true,
          action,
          summary: `${scenes.length} \u4E2A\u573A\u666F\u6587\u4EF6`,
          detail: [`\u5DE5\u4F5C\u533A ${gate.canonical}\uFF1A`, ...scenes.map((entry) => `\xB7 ${describeScene(entry, gate.canonical)}`)].join("\n"),
          files: scenes.map((entry) => entry.path)
        };
      }
      if (action === "env") {
        const probe = await service.probe();
        const lines = [
          `Python\uFF1A${String(probe.pythonPath ?? "?")} ${probe.pythonPresent === true ? "\uFF08\u5C31\u7EEA\uFF09" : "\uFF08\u7F3A\u5931\uFF09"}`,
          `Manim\uFF1A${String(probe.manim ?? "\u672A\u5B89\u88C5")} \xB7 PyAV ${String(probe.av ?? "?")} \xB7 matplotlib ${String(probe.matplotlib ?? "?")}`,
          `LaTeX\uFF1A${probe.tex === true ? `\u53EF\u7528\uFF08${String(probe.latex)}\uFF09` : "\u4E0D\u53EF\u7528 \u2014\u2014 \u7528 manimkit.mathtex() \u800C\u4E0D\u662F MathTex/Tex"}`,
          `\u7F13\u5B58\u76EE\u5F55\uFF1A${String(probe.cacheDir ?? config.cacheDir)}`,
          `\u753B\u8D28\u9884\u8BBE\uFF1A${QUALITIES.map((quality) => quality.id).join(" / ")}`,
          `\u80CC\u666F\u8272\uFF1A${config.background} \xB7 \u6210\u7247\u590D\u5236\u5230\uFF1A${config.outputDir === "" ? "\u4E0D\u590D\u5236" : `${config.outputDir}/`}`
        ];
        if (probe.ok !== true) lines.push(`\u26A0\uFE0F ${String(probe.error ?? "\u8FD0\u884C\u65F6\u4E0D\u53EF\u7528")}`);
        return { ok: probe.ok === true, action, summary: probe.ok === true ? "\u8FD0\u884C\u65F6\u5C31\u7EEA" : "\u8FD0\u884C\u65F6\u4E0D\u53EF\u7528", detail: lines.join("\n"), files: [] };
      }
      if (action === "template") {
        try {
          const created = await service.scaffold(gate.canonical, input.name ?? "Explainer", input.dir ?? "animations");
          const relativePath = relative2(gate.canonical, created.path).replaceAll("\\", "/");
          return {
            ok: true,
            action,
            summary: `\u5DF2\u521B\u5EFA ${relativePath}`,
            detail: [
              `\u5DF2\u521B\u5EFA ${relativePath}\uFF08\u573A\u666F\u7C7B ${created.scene}\uFF09\u3002`,
              "\u63A5\u4E0B\u6765\uFF1A\u6253\u5F00\u5B83\u3001\u6539\u6210\u672C\u6B21\u8981\u8BB2\u7684\u5185\u5BB9\uFF0C\u7136\u540E manim_render(path=\u2026)\u3002",
              '\u5148\u6309\u8349\u7A3F\u753B\u8D28\u6E32\u67D3\uFF08quality="draft"\uFF09\u786E\u8BA4\u8282\u594F\u548C\u7248\u5F0F\uFF0C\u518D\u51FA\u9AD8\u6E05\u3002'
            ].join("\n"),
            files: [created.path]
          };
        } catch (error) {
          return fail2(action, error instanceof Error ? error.message : String(error));
        }
      }
      const absolute = resolvePathArg(ctx, input.path);
      if (absolute === "") return fail2(action, "path is required");
      const target = action === "write" ? await service.resolveScenePathForWrite(gate.canonical, absolute) : await service.resolveScenePath(gate.canonical, absolute);
      if (!target.ok) return fail2(action, target.error);
      if (action === "read") {
        const source = await readFile2(target.absolute, "utf8");
        const lines = source.split("\n");
        const shown = lines.slice(0, 900);
        return {
          ok: true,
          action,
          summary: `${basename2(target.absolute)} \xB7 ${lines.length} \u884C`,
          detail: [
            `${relative2(gate.canonical, target.absolute).replaceAll("\\", "/")}\uFF08${lines.length} \u884C\uFF09`,
            "```python",
            ...shown,
            ...lines.length > shown.length ? [`\u2026 \u8FD8\u6709 ${lines.length - shown.length} \u884C`] : [],
            "```"
          ].join("\n"),
          files: [target.absolute]
        };
      }
      if (action === "write") {
        const source = input.source;
        if (typeof source !== "string" || source.trim() === "") return fail2(action, "source is required for write");
        await writeFile2(target.absolute, source, "utf8");
        service.invalidateScan(gate.canonical);
        const check = await syntaxCheck(config, target.absolute);
        const relativePath = relative2(gate.canonical, target.absolute).replaceAll("\\", "/");
        if (!check.ok) {
          return {
            ok: false,
            action,
            summary: `${relativePath} \u8BED\u6CD5\u9519\u8BEF`,
            detail: [`\u5DF2\u5199\u5165 ${relativePath}\uFF0C\u4F46\u8BED\u6CD5\u68C0\u67E5\u6CA1\u901A\u8FC7\uFF1A`, "```", check.message, "```"].join("\n"),
            files: [target.absolute],
            error: "syntax error"
          };
        }
        const resolved = await service.resolveSceneName(target.absolute, input.scene);
        const sceneLine = resolved.ok ? `\u573A\u666F\u7C7B\uFF1A${resolved.scene}` : `\u26A0\uFE0F ${resolved.error}`;
        return {
          ok: true,
          action,
          summary: `${relativePath} \u5DF2\u4FDD\u5B58`,
          detail: [`\u5DF2\u5199\u5165 ${relativePath}\uFF0C\u8BED\u6CD5\u68C0\u67E5\u901A\u8FC7\u3002`, sceneLine, `\u4E0B\u4E00\u6B65\uFF1Amanim_render(path='${relativePath}', quality='draft')`].join("\n"),
          files: [target.absolute]
        };
      }
      return fail2(action, `\u672A\u77E5 action\uFF1A${action}`);
    }
  });
}
function fail2(action, message) {
  return { ok: false, action, summary: message, detail: `\u274C ${message}`, files: [], error: message };
}
function renderTool(ctx, service, engine, config) {
  return defineTool({
    name: "manim_render",
    description: [
      "[dsh-manim] Render a Manim scene to an .mp4 and return its path, duration and \u2014 by default \u2014 still frames you can look at with read_image.",
      'Before rendering it needs to know how many animations the scene has and how long it runs, so it can show a real progress bar and fail fast on a broken scene. That measurement is cached per scene revision: the first render of a scene pays for it, every later render (the final 1080p60 after a draft, say) reuses it. Set plan="always" to force a fresh measurement or plan="never" to skip it.',
      "The render is synchronous: this call returns when the video exists (or the timeout expires). It typically takes 30 s for a 20 s draft and several minutes for 1080p60.",
      "quality='draft' (480p15) is the iteration setting; '720p30', '1080p60' (default), '1440p60' and '4k60' are the shipping ones. Always iterate on draft, then render the final quality once the content is right.",
      "frames=0 skips the stills; the default 4 are written to the plugin cache and their absolute paths are returned for read_image.",
      "NOTE: LaTeX is unavailable on this machine \u2014 use `mathtex()` from manimkit for formulas, never MathTex/Tex."
    ].join("\n"),
    parameters: {
      path: { type: "string", description: "Scene file (absolute or workspace-relative)", required: true },
      scene: { type: "string", description: "Scene class; omit when the file defines exactly one" },
      quality: { type: "string", description: "Quality preset id: 'draft' | '720p30' | '1080p60' | '1440p60' | '4k60'" },
      plan: {
        type: "string",
        description: "When to run the measuring pre-flight pass. 'auto' (default) reuses the plan cached from a previous render of this scene and only measures when the scene file changed; 'always' forces a fresh measurement; 'never' skips it (no total for the progress bar, and a broken scene fails at render time instead of up front)."
      },
      frames: { type: "number", description: "How many evenly spaced stills to extract afterwards (default 4, 0 = none)" },
      notes: { type: "string", description: "A one-line note recorded with the render, e.g. what changed in this iteration" },
      root: { type: "string", description: "Workspace root; defaults to the session workspace" }
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: "text", text: value.detail }]
    },
    async execute(args) {
      const input = args;
      const action = "render";
      const root = rootFor(ctx, input.root);
      if (root === "") return fail2(action, "\u65E0\u6CD5\u786E\u5B9A\u5DE5\u4F5C\u533A\uFF1A\u6CA1\u6709\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u8BF7\u663E\u5F0F\u4F20 root");
      const gate = await service.gate(root);
      if (!gate.ok) return fail2(action, gate.error);
      const absolute = resolvePathArg(ctx, input.path);
      if (absolute === "") return fail2(action, "path is required");
      const target = await service.resolveScenePath(gate.canonical, absolute);
      if (!target.ok) return fail2(action, target.error);
      const planArg = input.plan ?? "auto";
      if (!["auto", "always", "never"].includes(planArg)) {
        return fail2(action, `plan \u53EA\u80FD\u662F auto / always / never\uFF0C\u6536\u5230 ${planArg}`);
      }
      const planMode = planArg === "always" ? true : planArg === "never" ? false : "auto";
      const requested = input.quality === void 0 ? void 0 : qualityById(input.quality);
      if (input.quality !== void 0 && requested === void 0) {
        return fail2(action, `\u672A\u77E5\u753B\u8D28 ${input.quality}\uFF1B\u53EF\u7528\uFF1A${QUALITIES.map((q) => q.id).join(", ")}`);
      }
      const quality = requested ?? service.qualityFor(null);
      const resolved = await service.resolveSceneName(target.absolute, input.scene);
      if (!resolved.ok) return fail2(action, resolved.error);
      const frameCount = Math.max(0, Math.min(12, Math.round(input.frames ?? 4)));
      const job = await service.startRender({
        root: gate.canonical,
        path: target.absolute,
        scene: resolved.scene,
        quality,
        origin: "tool",
        plan: planMode
      });
      const settled = await service.waitFor(job.id, 30 * 60 * 1e3);
      if (settled === null) return fail2(action, "\u6E32\u67D3\u4EFB\u52A1\u4E22\u5931\u4E86");
      if (settled.state !== "done") {
        const reason = settled.error?.message ?? (settled.state === "cancelled" ? "\u5DF2\u53D6\u6D88" : "\u6E32\u67D3\u672A\u5B8C\u6210");
        return {
          ok: false,
          action,
          summary: `\u6E32\u67D3\u5931\u8D25\uFF1A${reason}`,
          detail: [
            `\u274C ${reason}`,
            settled.progress.done > 0 ? `\u5DF2\u5B8C\u6210 ${settled.progress.done}${settled.progress.total === null ? "" : `/${settled.progress.total}`} \u6BB5\u52A8\u753B\u3002` : "",
            settled.error?.traceback === void 0 ? "" : ["```", settled.error.traceback.slice(-2e3), "```"].join("\n"),
            jobReport(settled)
          ].filter((line) => line !== "").join("\n"),
          files: [],
          error: reason
        };
      }
      const files = [];
      let frameNote = "";
      if (frameCount > 0 && settled.result !== null) {
        try {
          const frames = await service.storyboard({
            video: settled.result.video,
            keyPath: settled.path,
            qualityId: settled.quality,
            count: frameCount,
            width: 720
          });
          engine.setFrames(settled.id, frames);
          files.push(...frames.map((frame) => frame.path));
          frameNote = [
            `\u5206\u955C ${frames.length} \u5E27\uFF08\u7528 read_image \u770B\u5B83\u4EEC\uFF0C\u786E\u8BA4\u7248\u5F0F\u548C\u6587\u5B57\u6CA1\u6709\u91CD\u53E0/\u51FA\u6846\uFF09\uFF1A`,
            ...frames.map((frame) => `  \u7B2C ${frame.time.toFixed(1)}s \u2192 ${frame.path}`)
          ].join("\n");
        } catch (error) {
          frameNote = `\u26A0\uFE0F \u62BD\u5E27\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`;
        }
      }
      const notes = typeof input.notes === "string" && input.notes !== "" ? `\u5907\u6CE8\uFF1A${input.notes}` : "";
      return {
        ok: true,
        action,
        summary: `${settled.scene ?? basename2(settled.path)} \u6E32\u67D3\u5B8C\u6210 \xB7 ${quality.id} \xB7 ${humanDuration(settled.result?.duration ?? null)}`,
        detail: [
          `\u2705 ${settled.scene ?? ""} @ ${quality.id}`,
          jobReport(settled),
          notes,
          frameNote,
          "\u8981\u770B\u7247\u5B50\u5728\u9762\u677F\u91CC\u70B9\u300C\u52A8\u753B\u300D\u6807\u7B7E\uFF1B\u6210\u7247\u8DEF\u5F84\u89C1\u4E0A\u3002"
        ].filter((line) => line !== "").join("\n"),
        files: settled.result === null ? [] : [settled.result.output ?? settled.result.video, ...files]
      };
    }
  });
}
function voiceTool(ctx, service) {
  return defineTool({
    name: "manim_voice",
    description: [
      "[dsh-manim] Narration for an explainer video: list the text-to-speech voices available here, or synthesise a script into WAV files plus a cue sheet.",
      "No voice model needs downloading. `edge` (Microsoft Edge read-aloud) is free, needs no API key, and its Chinese voices are close to human; `sapi` (Windows offline) is robotic but works with no network. auto tries edge and falls back to sapi, and says which one it used.",
      "action='list': the engines that work here and every Chinese voice they offer \u2014 call this first, and again if synthesis fails.",
      "action='speak': synthesise `lines` into WAVs plus a `cues.json` cue sheet. Give each line an `id`; the sheet records that line's `at` (absolute start offset) and `duration`.",
      'Then in the scene: `cues = narration(self, "voice/cues.json")` adds the whole voice track at once, and `hold(self, cues, "b1")` waits out the rest of that line \u2014 write the animation for a beat, call hold(), and the picture sits exactly as long as the voice runs. That is what keeps picture and voice in step without timing anything by hand.',
      "The picture must be at least as long as the voice: the muxer drops an over-long narration at the video end, silently. The render emits a warning when that happens \u2014 do not ignore it.",
      "Chinese inside `mathtex()` is refused on purpose (it would render as empty boxes). Chinese belongs in `text()`; formulas take symbols only."
    ].join("\n"),
    parameters: {
      action: { type: "string", enum: ["list", "speak"], description: "list voices, or synthesise a script", required: true },
      lines: {
        type: "array",
        description: "action=speak: the script, one entry per beat \u2014 [{ id, text }]",
        items: { type: "object", additionalProperties: true }
      },
      voice: { type: "string", description: "Voice id, e.g. 'zh-CN-XiaoxiaoNeural' (default), or 'Microsoft Huihui Desktop' for the offline engine" },
      rate: { type: "string", description: "Speaking rate in Edge's grammar, e.g. '+10%' or '-15%' (default '+0%')" },
      engine: { type: "string", description: "'auto' (default), 'edge', or 'sapi'" },
      gap: { type: "number", description: "Silence between lines, seconds (default 0.35)" },
      dir: { type: "string", description: "Workspace-relative output directory (default 'animations/voice')" },
      root: { type: "string", description: "Workspace root; defaults to the session workspace" }
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: "text", text: value.detail }]
    },
    async execute(args) {
      const input = args;
      const action = input.action ?? "list";
      const root = rootFor(ctx, input.root);
      if (root === "") return fail2(action, "\u65E0\u6CD5\u786E\u5B9A\u5DE5\u4F5C\u533A\uFF1A\u6CA1\u6709\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u8BF7\u663E\u5F0F\u4F20 root");
      const gate = await service.gate(root);
      if (!gate.ok) return fail2(action, gate.error);
      if (action === "list") {
        try {
          const inventory = await service.voiceInventory();
          const withEngine = (name2) => inventory.voices.filter((voice) => voice.engine === name2);
          const edge = withEngine("edge");
          const sapi = withEngine("sapi");
          const line = (voice) => {
            const extras = [voice.gender, voice.tags ?? voice.culture].filter((value) => typeof value === "string" && value !== "");
            return `  ${String(voice.id)}${extras.length === 0 ? "" : ` \xB7 ${extras.join(" \xB7 ")}`}`;
          };
          const engines = Object.entries(inventory.engines);
          const usable = engines.some(([, ok]) => ok);
          const detail = [
            `\u53EF\u7528\u5F15\u64CE\uFF1A${engines.map(([name2, ok]) => `${name2}=${ok ? "\u53EF\u7528" : "\u4E0D\u53EF\u7528"}`).join(" \xB7 ")}`,
            "",
            `edge\uFF08\u5728\u7EBF\uFF0C\u63A8\u8350\uFF09\u2014 ${edge.length} \u4E2A\u4E2D\u6587\u97F3\u8272\uFF1A`,
            ...edge.map(line),
            "",
            `sapi\uFF08Windows \u79BB\u7EBF\uFF0C\u65AD\u7F51\u65F6\u515C\u5E95\uFF09\u2014 ${sapi.length} \u4E2A\uFF1A`,
            ...sapi.map(line),
            ...inventory.errors.length === 0 ? [] : ["", ...inventory.errors.map((error) => `\u26A0\uFE0F ${error}`)]
          ].join("\n");
          return {
            ok: usable,
            action,
            summary: usable ? `\u5728\u7EBF ${edge.length} \u4E2A\u97F3\u8272 \xB7 \u79BB\u7EBF ${sapi.length} \u4E2A` : "\u6CA1\u6709\u53EF\u7528\u7684\u8BED\u97F3\u5F15\u64CE",
            detail,
            files: [],
            ...usable ? {} : { error: "\u6CA1\u6709\u53EF\u7528\u7684\u8BED\u97F3\u5F15\u64CE" }
          };
        } catch (error) {
          return fail2(action, error instanceof Error ? error.message : String(error));
        }
      }
      if (action === "speak") {
        const lines = (input.lines ?? []).map((item, index) => ({ id: String(item.id ?? `b${index + 1}`), text: String(item.text ?? "").trim() })).filter((item) => item.text !== "");
        if (lines.length === 0) return fail2(action, "speak \u9700\u8981 lines\uFF08\u6BCF\u53E5\u8981\u6709 text\uFF09");
        if (lines.length > 80) return fail2(action, `lines \u6700\u591A 80 \u53E5\uFF08\u6536\u5230 ${lines.length}\uFF09`);
        try {
          const result = await service.speak({
            root: gate.canonical,
            dir: input.dir ?? "animations/voice",
            lines,
            ...input.voice === void 0 ? {} : { voice: input.voice },
            ...input.rate === void 0 ? {} : { rate: input.rate },
            ...input.engine === void 0 ? {} : { engine: input.engine },
            ...input.gap === void 0 ? {} : { gap: input.gap }
          });
          const cues = result.cues ?? [];
          const files = result.filesRel ?? [];
          const sheetRel = String(result.sheetRel ?? "");
          const sheetForScene = sheetRel.replace(/^animations\//, "");
          const firstId = String(cues[0]?.id ?? "b1");
          const detail = [
            `\u2705 ${lines.length} \u53E5 \xB7 \u5F15\u64CE ${String(result.engine)} \xB7 \u97F3\u8272 ${String(result.voice)} \xB7 \u65C1\u767D\u603B\u957F ${String(result.total)} \u79D2`,
            "",
            ...cues.map((cue) => `  ${String(cue.id)}  at=${Number(cue.at).toFixed(2)}s  dur=${Number(cue.duration).toFixed(2)}s  ${String(cue.text)}`),
            "",
            `cue sheet\uFF1A${sheetRel}`,
            "",
            "\u573A\u666F\u91CC\u8FD9\u6837\u7528\uFF08\u52A8\u753B\u5199\u5728\u524D\uFF0Chold() \u628A\u8FD9\u4E00\u62CD\u6491\u5230\u65C1\u767D\u8BF4\u5B8C\uFF09\uFF1A",
            "```python",
            "from manimkit import hold, narration",
            "",
            "    def construct(self):",
            `        cues = narration(self, "${sheetForScene}")`,
            "        self.play(Write(title), run_time=1.0)",
            `        hold(self, cues, "${firstId}")`,
            "```",
            "\u753B\u9762\u603B\u957F\u5FC5\u987B \u2265 \u65C1\u767D\u603B\u957F\uFF0C\u5426\u5219\u7ED3\u5C3E\u4F1A\u88AB\u9759\u9ED8\u5207\u6389\uFF08\u6E32\u67D3\u65F6\u4F1A\u7ED9\u4F60\u544A\u8B66\uFF09\u3002"
          ].join("\n");
          return {
            ok: true,
            action,
            summary: `${lines.length} \u53E5\u65C1\u767D\u5DF2\u751F\u6210 \xB7 \u603B\u957F ${String(result.total)} \u79D2 \xB7 ${String(result.engine)}`,
            detail,
            files: [sheetRel, ...files].filter((item) => item !== "")
          };
        } catch (error) {
          return fail2(action, error instanceof Error ? error.message : String(error));
        }
      }
      return fail2(action, `\u672A\u77E5 action\uFF1A${action}`);
    }
  });
}
function framesTool(ctx, service, engine) {
  return defineTool({
    name: "manim_frames",
    description: [
      "[dsh-manim] Extract still frames (PNG) from a rendered Manim video, and return their absolute paths so read_image can look at them.",
      "Use it to check an animation without re-rendering: confirm a caption is readable, a formula fits, nothing overlaps, and the beats land where you intended.",
      "Give either `times` (exact seconds) or `count` (evenly spaced samples, the default 6). `path` names the scene file whose latest render you want; omit it to use the most recent render in the workspace."
    ].join("\n"),
    parameters: {
      path: { type: "string", description: "Scene file whose latest render to use; omit for the most recent render in the workspace" },
      scene: { type: "string", description: "Scene class name" },
      quality: { type: "string", description: "Quality preset id of the render to use" },
      count: { type: "number", description: "Number of evenly spaced frames (default 6, ignored when times is given)" },
      times: { type: "string", description: 'Comma-separated seconds, e.g. "0.5,3,7.5" \u2014 overrides count' },
      width: { type: "number", description: "PNG width in pixels (default 720)" },
      root: { type: "string", description: "Workspace root; defaults to the session workspace" }
    },
    output: {
      schema: RESULT_SCHEMA,
      render: (_args, value) => [{ type: "text", text: value.detail }]
    },
    async execute(args) {
      const action = "frames";
      const input = args;
      const root = rootFor(ctx, input.root);
      if (root === "") return fail2(action, "\u65E0\u6CD5\u786E\u5B9A\u5DE5\u4F5C\u533A\uFF1A\u6CA1\u6709\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u8BF7\u663E\u5F0F\u4F20 root");
      const gate = await service.gate(root);
      if (!gate.ok) return fail2(action, gate.error);
      const records = await service.readIndex(gate.canonical);
      let record;
      if (input.path !== void 0 && input.path !== "") {
        const absolute = resolvePathArg(ctx, input.path);
        const target = await service.resolveScenePath(gate.canonical, absolute);
        if (!target.ok) return fail2(action, target.error);
        record = records.find(
          (item) => item.sceneFile === target.absolute && (input.scene === void 0 || item.scene === input.scene) && (input.quality === void 0 || item.quality === input.quality)
        );
        if (record === void 0) {
          return fail2(action, `\u8FD8\u6CA1\u6709\u8FD9\u4E2A\u573A\u666F\u7684\u6E32\u67D3\u7ED3\u679C\uFF1B\u5148 manim_render(path='${input.path}')`);
        }
      } else {
        record = records[0];
        if (record === void 0) return fail2(action, "\u5DE5\u4F5C\u533A\u91CC\u8FD8\u6CA1\u6709\u6E32\u67D3\u7ED3\u679C\uFF0C\u5148\u8DD1 manim_render");
      }
      const times = (input.times ?? "").split(",").map((part) => part.trim()).filter((part) => part !== "").map((part) => Number(part)).filter((value) => Number.isFinite(value) && value >= 0);
      const width = Math.max(160, Math.min(1920, Math.round(input.width ?? 720)));
      try {
        const frames = await service.storyboard({
          video: record.video,
          keyPath: record.sceneFile,
          qualityId: record.quality,
          count: Math.max(1, Math.min(24, Math.round(input.count ?? 6))),
          times,
          width
        });
        const latest = engine.latestFor(gate.canonical, record.sceneFile);
        if (latest !== void 0) engine.setFrames(latest.id, frames);
        return {
          ok: true,
          action,
          summary: `${frames.length} \u5E27 \xB7 ${basename2(record.sceneFile)}`,
          detail: [
            `${basename2(record.sceneFile)}\uFF08${record.scene} @ ${record.quality}\uFF0C\u65F6\u957F ${humanDuration(record.duration)}\uFF09\u7684 ${frames.length} \u5E27\uFF1A`,
            ...frames.map((frame) => `  \u7B2C ${frame.time.toFixed(2)}s \u2192 ${frame.path}`),
            "\u7528 read_image \u6253\u5F00\u5B83\u4EEC\u68C0\u67E5\u753B\u9762\u3002"
          ].join("\n"),
          files: frames.map((frame) => frame.path)
        };
      } catch (error) {
        return fail2(action, error instanceof Error ? error.message : String(error));
      }
    }
  });
}
function buildAgentTools(ctx, service, engine, config) {
  const all = [
    ["manim_scene", sceneTool(ctx, service, config)],
    ["manim_render", renderTool(ctx, service, engine, config)],
    ["manim_frames", framesTool(ctx, service, engine)],
    ["manim_voice", voiceTool(ctx, service)]
  ];
  return all.filter(([id]) => exposed(config, id)).map(([, definition]) => definition);
}

// src/index.ts
var name = "dsh-manim";
var inject = ["tools", "workspaceRegistry", "webServer"];
async function apply(ctx, config) {
  const resolved = resolveConfig(config);
  try {
    ctx.logger?.info?.("dsh-manim: \u52A8\u753B\u5DE5\u4F5C\u5BA4\u5DF2 attach");
  } catch {
  }
  const engine = new RenderEngine({
    pythonPath: resolved.pythonPath,
    driverPath: resolved.driverPath,
    jobTtlSeconds: resolved.jobTtlSeconds,
    renderTimeoutSeconds: resolved.renderTimeoutSeconds
  });
  ctx.effect(() => () => engine.dispose(), "dsh-manim: render engine");
  const service = new ManimService(ctx, resolved, engine);
  const disposeRoutes = registerManimRoutes(ctx, service, engine, resolved);
  ctx.effect(() => () => disposeRoutes(), "dsh-manim: /dsh-manim routes");
  ctx.inject(["skills"], (scope) => {
    try {
      registerBundledSkills(scope);
    } catch (error) {
      console.error(`[dsh-manim] skills registration skipped: ${String(error)}`);
    }
  });
  const definitions = buildAgentTools(ctx, service, engine, resolved);
  ctx.effect(() => {
    const disposers = definitions.map((definition) => ctx.tools.register(definition));
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, `dsh-manim: ${definitions.length} agent tool(s)`);
  void service;
}
export {
  BUNDLED_SKILLS,
  DEFAULT_QUALITY,
  ManimService,
  PLUGIN_ROOT,
  QUALITIES,
  RenderEngine,
  TOOL_IDS,
  apply,
  buildAgentTools,
  defaultPythonPath,
  findWorkspaceRootForSession,
  inject,
  isPathInside,
  listWorkspaceRoots,
  name,
  normalizeForPrefix,
  parseEvent,
  parseSetupProgress,
  parseSkillMarkdown,
  qualityById,
  registerBundledSkills,
  registerManimRoutes,
  resolveConfig,
  runDriver,
  runPythonSpec,
  safeClassName,
  safeName,
  scanScenes,
  sceneKey,
  verifyPathInSomeWorkspace,
  verifyWorkspaceRoot
};
