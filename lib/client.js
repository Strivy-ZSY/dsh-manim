window.__ModuleLoader__.load({
	id: "dsh-manim",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region dsh-manim styles
		const css = "/* src/client/studio.module.css */\n.studio_railMark {\n  color: var(--dsh-file-type-icon-color, currentColor);\n  flex: none;\n}\n.studio_studioMark {\n  color: var(--dsw-static-violet-500, #8b5cf6);\n  flex: none;\n}\n.studio_titleIcon {\n  flex: none;\n}\n.studio_studio {\n  --pane-pad: 10px;\n  --player-max-h: max(180px, calc(100vh - 150px));\n  display: flex;\n  flex-direction: column;\n  flex: 1 1 auto;\n  gap: 10px;\n  min-height: 0;\n  min-width: 0;\n  height: 100%;\n  padding: var(--pane-pad) var(--pane-pad) 14px;\n  overflow-y: auto;\n  overflow-x: hidden;\n  background: var(--dsw-alias-bg-base, #ffffff);\n  color: var(--dsw-alias-label-primary, #1f2937);\n  font-size: 13px;\n  line-height: 1.5;\n}\n.studio_notice {\n  padding: 18px 14px;\n  color: var(--dsw-alias-label-caption, #6b7280);\n  text-align: center;\n}\n.studio_muted {\n  color: var(--dsw-alias-label-caption, #6b7280);\n}\n.studio_small {\n  font-size: 12px;\n}\n.studio_ellipsis {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.studio_error {\n  padding: 7px 9px;\n  border: 1px solid var(--dsw-alias-border-l4, #e5e7eb);\n  border-left: 3px solid #ef5f6b;\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-layer-1, #f9fafb);\n  color: var(--dsw-alias-label-primary, #1f2937);\n  word-break: break-word;\n}\n.studio_toolbar {\n  position: sticky;\n  top: calc(-1 * var(--pane-pad));\n  z-index: 1;\n  display: flex;\n  gap: 6px;\n  align-items: center;\n  flex-wrap: wrap;\n  flex: none;\n  margin: calc(-1 * var(--pane-pad)) calc(-1 * var(--pane-pad)) 0;\n  padding: 5px var(--pane-pad) 8px;\n  background: var(--dsw-alias-bg-base, #ffffff);\n  box-shadow: 0 1px 0 var(--dsw-alias-border-l4, #e5e7eb);\n}\n.studio_fileMenu,\n.studio_qualityMenu {\n  flex: none;\n}\n.studio_iconOnly {\n  padding: 0;\n  width: 28px;\n}\n.studio_stage {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 10px;\n  align-items: flex-start;\n  flex: none;\n  min-width: 0;\n}\n[data-sidebar-right-panel=fullscreen] .studio_stage {\n  flex-wrap: nowrap;\n}\n.studio_stageMain {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  flex: 3 1 520px;\n  min-width: 0;\n}\n.studio_stageSide {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  flex: 1 1 320px;\n  min-width: 0;\n}\n.studio_sectionFlat {\n  padding-top: 0;\n  border-top: none;\n}\n.studio_player {\n  display: flex;\n  justify-content: flex-start;\n  flex: none;\n  min-height: 0;\n}\n.studio_video {\n  display: block;\n  max-width: 100%;\n  max-height: var(--player-max-h);\n  width: auto;\n  height: auto;\n  border-radius: 8px;\n  background: #000000;\n}\n.studio_playerEmpty {\n  width: 100%;\n  padding: 26px 12px;\n  border: 1px solid var(--dsw-alias-border-l4, #e5e7eb);\n  border-radius: 8px;\n  color: var(--dsw-alias-label-caption, #9ca3af);\n  text-align: center;\n  background: var(--dsw-alias-bg-layer-1, #f9fafb);\n}\n.studio_status {\n  display: flex;\n  flex-direction: column;\n  gap: 5px;\n  flex: none;\n}\n.studio_statusLine {\n  display: flex;\n  gap: 8px;\n  flex-wrap: wrap;\n  align-items: baseline;\n  font-size: 12px;\n}\n.studio_stateOk {\n  font-weight: 600;\n}\n.studio_stateBad {\n  font-weight: 600;\n  color: #ef5f6b;\n}\n.studio_bar {\n  height: 5px;\n  border-radius: 3px;\n  background: var(--dsw-alias-bg-layer-1, #eef1f5);\n  overflow: hidden;\n}\n.studio_barFill {\n  height: 100%;\n  background: #4d9cff;\n  transition: width 0.25s ease-out;\n}\n.studio_barIndeterminate {\n  width: 35%;\n  animation: studio_manimSweep 1.1s ease-in-out infinite;\n}\n@keyframes studio_manimSweep {\n  0% {\n    transform: translateX(-100%);\n  }\n  100% {\n    transform: translateX(320%);\n  }\n}\n.studio_section {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  flex: none;\n  padding-top: 8px;\n  border-top: 1px solid var(--dsw-alias-border-l4, #eef1f5);\n}\n.studio_sectionHead {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n  justify-content: space-between;\n}\n.studio_sectionTitle {\n  font-weight: 600;\n  flex: none;\n}\n.studio_board {\n  display: flex;\n  gap: 6px;\n  overflow-x: auto;\n  padding-bottom: 4px;\n}\n[data-sidebar-right-panel=fullscreen] .studio_stage {\n  align-items: stretch;\n}\n[data-sidebar-right-panel=fullscreen] .studio_stageSide {\n  min-height: 0;\n}\n[data-sidebar-right-panel=fullscreen] .studio_stageSide > .studio_sectionFlat {\n  flex: 1 1 auto;\n  min-height: 0;\n}\n[data-sidebar-right-panel=fullscreen] .studio_board {\n  flex: 1 1 auto;\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  grid-auto-rows: minmax(80px, 1fr);\n  gap: 6px;\n  overflow: auto;\n  padding-bottom: 0;\n}\n[data-sidebar-right-panel=fullscreen] .studio_boardCell {\n  height: 100%;\n}\n[data-sidebar-right-panel=fullscreen] .studio_boardImg {\n  width: 100%;\n  height: 100%;\n  object-fit: contain;\n}\n.studio_boardCell {\n  position: relative;\n  flex: none;\n  padding: 0;\n  border: 1px solid var(--dsw-alias-border-l4, #e5e7eb);\n  border-radius: 6px;\n  overflow: hidden;\n  background: #000000;\n  cursor: pointer;\n  line-height: 0;\n}\n.studio_boardCell:hover {\n  border-color: #4d9cff;\n}\n.studio_boardImg {\n  display: block;\n  width: 104px;\n  height: auto;\n}\n.studio_boardTime {\n  position: absolute;\n  right: 3px;\n  bottom: 3px;\n  padding: 0 4px;\n  border-radius: 3px;\n  background: rgb(0 0 0 / 62%);\n  color: #ffffff;\n  font-size: 10px;\n  line-height: 15px;\n}\n.studio_scenes {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  max-height: 34vh;\n  overflow-y: auto;\n}\n.studio_sceneRow {\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n  width: 100%;\n  padding: 6px 8px;\n  border: 1px solid transparent;\n  border-radius: 6px;\n  background: transparent;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n.studio_sceneRow:hover {\n  background: var(--dsw-alias-interactive-bg-hover, #f3f4f6);\n}\n.studio_sceneRowActive {\n  border-color: #4d9cff;\n  background: var(--dsw-alias-bg-layer-1, #f9fafb);\n}\n.studio_sceneName {\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.studio_sceneMeta {\n  font-size: 11px;\n  color: var(--dsw-alias-label-caption, #6b7280);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.studio_sceneDot {\n  margin: 0 4px;\n}\n.studio_chips {\n  display: flex;\n  gap: 6px;\n  align-items: center;\n  flex-wrap: wrap;\n}\n.studio_chip {\n  padding: 2px 9px;\n  border: 1px solid var(--dsw-alias-border-l4, #e5e7eb);\n  border-radius: 999px;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary, #4b5563);\n  font-size: 11px;\n  cursor: pointer;\n}\n.studio_chipActive {\n  border-color: #4d9cff;\n  color: #4d9cff;\n}\n.studio_log {\n  max-height: 30vh;\n  margin: 0;\n  padding: 8px;\n  overflow: auto;\n  border: 1px solid var(--dsw-alias-border-l4, #e5e7eb);\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-layer-1, #f9fafb);\n  color: var(--dsw-alias-label-secondary, #4b5563);\n  font-family:\n    ui-monospace,\n    SFMono-Regular,\n    Consolas,\n    monospace;\n  font-size: 11px;\n  line-height: 1.45;\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n.studio_rootPicker {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 16px 14px;\n}\n.studio_rootPickerTitle {\n  margin: 0 0 2px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary, #111827);\n}\n.studio_rootPickerHint {\n  margin: 0 0 6px;\n  font-size: 12px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-caption, #6b7280);\n}\n.studio_rootItem {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 2px;\n  width: 100%;\n  padding: 8px 10px;\n  border: 1px solid var(--dsw-alias-border-l2, #e5e7eb);\n  border-radius: 8px;\n  background: none;\n  text-align: left;\n  cursor: pointer;\n  font: inherit;\n  color: inherit;\n}\n.studio_rootItem:hover {\n  background: var(--dsw-alias-bg-l2, #f3f4f6);\n}\n.studio_rootItemName {\n  font-weight: 500;\n}\n.studio_rootItemPath {\n  font-size: 12px;\n  color: var(--dsw-alias-label-caption, #6b7280);\n  word-break: break-all;\n}\n.studio_documentVideoWrap {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 100%;\n  height: 100%;\n  padding: 8px;\n  box-sizing: border-box;\n  background: #000;\n}\n.studio_documentVideo {\n  display: block;\n  max-width: 100%;\n  max-height: 100%;\n  background: #000;\n}\n.studio_setupBar {\n  display: block;\n  width: 100%;\n  height: 6px;\n  margin: 6px 0 4px;\n  border-radius: 3px;\n  background: var(--dsw-alias-bg-l3, #e5e7eb);\n  overflow: hidden;\n}\n.studio_setupBarFill {\n  height: 100%;\n  border-radius: 3px;\n  background: var(--dsw-alias-label-primary, #2563eb);\n  transition: width 400ms ease-out;\n}";
		const tagId = "dsh-manim/styles.css";
		const styleSelector = "style[data-plugin-css=" + JSON.stringify(tagId) + "]";
		const installStyles = () => {
			if (typeof document === "undefined" || document.head === null) return;
			const existing = document.querySelector(styleSelector);
			if (existing !== null) {
				// Same tag, newer build: keep it in step instead of leaving the old rules.
				if (existing.textContent !== css) existing.textContent = css;
				return;
			}
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-manim";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		};
		installStyles();
		if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.head !== null) {
			new MutationObserver(() => { if (document.querySelector(styleSelector) === null) installStyles(); })
				.observe(document.head, { childList: true });
		}
		//#endregion
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name2 in all)
		    __defProp(target, name2, { get: all[name2], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
		  // If the importer is in node compatibility mode or this is not an ESM
		  // file that has been converted to a CommonJS file using a Babel-
		  // compatible transform (i.e. "__esModule" has not been set), then set
		  // "default" to the CommonJS "module.exports" for node compatibility.
		  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
		  mod
		));
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.ts
		var index_exports = {};
		__export(index_exports, {
		  MANIM_ID: () => MANIM_ID,
		  MANIM_KIND: () => MANIM_KIND,
		  NS: () => NS,
		  Studio: () => Studio,
		  StudioView: () => StudioView,
		  apply: () => apply,
		  detectedWorkspaceRoot: () => detectedWorkspaceRoot,
		  inject: () => inject,
		  name: () => name
		});
		module.exports = __toCommonJS(index_exports);

		// src/client/api.ts
		var ManimApiError = class extends Error {
		  constructor(message, code) {
		    super(message);
		    this.code = code;
		    this.name = "ManimApiError";
		  }
		};
		async function post(path, body) {
		  let response;
		  try {
		    response = await fetch(path, {
		      method: "POST",
		      headers: { "content-type": "application/json" },
		      body: JSON.stringify(body)
		    });
		  } catch (error) {
		    throw new ManimApiError(`network error: ${error instanceof Error ? error.message : String(error)}`, "network");
		  }
		  let envelope;
		  try {
		    envelope = await response.json();
		  } catch {
		    throw new ManimApiError(`HTTP ${response.status}: invalid JSON response`, "protocol");
		  }
		  if (envelope.ok !== true) {
		    throw new ManimApiError(envelope.error?.message ?? `HTTP ${response.status}`, envelope.error?.code ?? "protocol");
		  }
		  return envelope.value;
		}
		var StudioApi = class {
		  /** @param root - the workspace root (session cwd) every call is bound to. */
		  constructor(root) {
		    this.root = root;
		  }
		  workspaces() {
		    return post("/dsh-manim/workspaces", {});
		  }
		  setupRuntime() {
		    return post("/dsh-manim/runtime/setup", {});
		  }
		  setupStatus() {
		    return post("/dsh-manim/runtime/setup-status", {});
		  }
		  sessionRoot(sessionId, cwd) {
		    return post("/dsh-manim/session-root", { sessionId, cwd });
		  }
		  list(request) {
		    return post("/dsh-manim/list", { root: this.root, refresh: request.refresh === true });
		  }
		  inspect(request) {
		    return post("/dsh-manim/inspect", { root: this.root, path: request.path });
		  }
		  render(request) {
		    return post("/dsh-manim/render", {
		      root: this.root,
		      path: request.path,
		      ...request.scene === void 0 ? {} : { scene: request.scene },
		      ...request.quality === void 0 ? {} : { quality: request.quality }
		    });
		  }
		  job(request) {
		    return post("/dsh-manim/job", { id: request.id });
		  }
		  cancel(request) {
		    return post("/dsh-manim/cancel", { id: request.id });
		  }
		  forget(request) {
		    return post("/dsh-manim/forget", { id: request.id });
		  }
		  storyboard(request) {
		    return post("/dsh-manim/storyboard", {
		      ...request,
		      ...request.id === void 0 ? { root: this.root } : {}
		    });
		  }
		  template(request) {
		    return post("/dsh-manim/template", {
		      root: this.root,
		      ...request.name === void 0 ? {} : { name: request.name },
		      ...request.dir === void 0 ? {} : { dir: request.dir }
		    });
		  }
		  probe(request) {
		    return post("/dsh-manim/probe", { force: request.force === true });
		  }
		  videoUrl(request) {
		    const query = new URLSearchParams();
		    if (request.id !== void 0) query.set("id", request.id);
		    else if (request.file !== void 0) {
		      query.set("root", this.root);
		      query.set("file", request.file);
		    } else {
		      query.set("root", this.root);
		      if (request.path !== void 0) query.set("path", request.path);
		      if (request.scene !== void 0) query.set("scene", request.scene);
		      if (request.quality !== void 0) query.set("quality", request.quality);
		    }
		    return `/dsh-manim/video?${query.toString()}`;
		  }
		  frameUrl(file) {
		    return `/dsh-manim/frame?file=${encodeURIComponent(file)}`;
		  }
		};

		// src/client/panel-row.tsx
		var import_react3 = require("react");

		// src/client/studio.tsx
		var import_react = require("react");

		// src/client/icons.tsx
		var primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"));
		var import_jsx_runtime = require("react/jsx-runtime");
		var TABLE = primitives;
		function FallbackGlyph({ className }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className, width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "4.5", y: "4.5", width: "7", height: "7", rx: "2", fill: "none", stroke: "currentColor", strokeWidth: "1.4" }) });
		}
		var MISSING_ICONS = [];
		function renderable(value) {
		  if (typeof value === "function") return true;
		  if (value === null || typeof value !== "object") return false;
		  const tag = value.$$typeof;
		  return typeof tag === "symbol" || typeof tag === "number" || tag !== void 0;
		}
		function candidate(names) {
		  for (const name2 of names) {
		    const value = TABLE[name2];
		    if (renderable(value)) {
		      return value;
		    }
		  }
		  MISSING_ICONS.push(names[0] ?? "(unknown)");
		  return FallbackGlyph;
		}
		var IconChevronDown = candidate(["IconChevronDownOutline14", "IconChevronDownOutlineRegular"]);
		var IconDownload = candidate(["IconDownloadOutline16", "IconDownloadOutlineRegular"]);
		var IconFolderOpen = candidate([
		  "IconFolderOpenOutline16",
		  "IconFolderOpenOutlineRegular",
		  "IconBrowseOutlineRegular"
		]);
		var IconLoading = candidate(["IconLoadingOutline16", "IconLoadingOutlineRegular"]);
		var IconPlay = candidate(["IconPlayOutline16", "IconPlayOutlineRegular"]);
		var IconPlus = candidate(["IconPlusOutline16", "IconPlusOutlineRegular"]);
		var IconRefresh = candidate(["IconRefreshOutline16", "IconRefreshOutlineRegular"]);
		var IconStop = candidate(["IconStopFill16", "IconStopFillRegular", "IconStopOutlineRegular"]);
		function PlainButton({ children, icon, title, disabled, onClick, className }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className, title, disabled, onClick, children: [
		    icon,
		    children
		  ] });
		}
		function PlainMenu({ anchor }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: anchor });
		}
		var ShellButton = renderable(TABLE.Button) ? TABLE.Button : PlainButton;
		var ShellMenu = renderable(TABLE.Menu) ? TABLE.Menu : PlainMenu;

		// src/client/workspace-root.ts
		var detected = "";
		var listeners = /* @__PURE__ */ new Set();
		var PICK_KEY = "dsh-manim.workspace";
		function rememberedPick(sessionId) {
		  try {
		    const raw = window.localStorage.getItem(PICK_KEY);
		    if (raw === null || sessionId === "") return "";
		    const table = JSON.parse(raw);
		    return text(table[sessionId]);
		  } catch {
		    return "";
		  }
		}
		function rememberPick(sessionId, path) {
		  if (sessionId === "") return;
		  try {
		    const raw = window.localStorage.getItem(PICK_KEY);
		    const table = raw === null ? {} : JSON.parse(raw);
		    table[sessionId] = path;
		    window.localStorage.setItem(PICK_KEY, JSON.stringify(table));
		  } catch {
		  }
		}
		function detectedWorkspaceRoot() {
		  return detected;
		}
		function subscribeWorkspaceRoot(listener) {
		  listeners.add(listener);
		  return () => {
		    listeners.delete(listener);
		  };
		}
		function publish(next) {
		  if (next === detected) return;
		  detected = next;
		  for (const listener of listeners) {
		    try {
		      listener();
		    } catch {
		    }
		  }
		}
		function text(value) {
		  return typeof value === "string" ? value : "";
		}
		function sameSession(a, b) {
		  const norm = (value) => text(value).replace(/^session-/, "").toLowerCase();
		  const left = norm(a);
		  return left !== "" && left === norm(b);
		}
		function currentSessionId(sessions) {
		  try {
		    return text(sessions?.getSnapshot?.().current);
		  } catch {
		    return "";
		  }
		}
		function sessionCwd(sessions, id) {
		  try {
		    const byId = sessions?.getSnapshot?.().byId;
		    if (byId === void 0 || id === "") return "";
		    return text(byId[id]?.cwd);
		  } catch {
		    return "";
		  }
		}
		var diagnosed = false;
		function diagnose(sessionId, rows) {
		  if (diagnosed) return;
		  diagnosed = true;
		  const detail = {
		    sessionId,
		    rows: rows.length,
		    sessionIdsPerRow: rows.map((row) => Array.isArray(row.sessionIds) ? row.sessionIds.length : -1),
		    sampleRowIds: rows.map((row) => Array.isArray(row.sessionIds) ? row.sessionIds.slice(0, 2).map(String) : [])
		  };
		  try {
		    void fetch("/dsh-manim/client-log", {
		      method: "POST",
		      headers: { "content-type": "application/json" },
		      body: JSON.stringify({ where: "workspace-detect", message: JSON.stringify(detail), stack: "" })
		    }).catch(() => {
		    });
		  } catch {
		  }
		}
		function derive(workspaces, sessions) {
		  let rows = [];
		  try {
		    const items = workspaces?.list?.getSnapshot?.().items;
		    if (Array.isArray(items)) rows = items;
		  } catch {
		    return "";
		  }
		  if (rows.length === 0) return "";
		  const id = currentSessionId(sessions);
		  if (id !== "") {
		    const owner = rows.find((row) => Array.isArray(row.sessionIds) && row.sessionIds.some((candidate2) => sameSession(candidate2, id)));
		    const path = text(owner?.path);
		    if (path !== "") return path;
		  }
		  diagnose(id, rows);
		  const cwd = sessionCwd(sessions, id).replaceAll(String.fromCharCode(92), "/").replace(/\/+$/, "");
		  if (cwd !== "") {
		    const inside = rows.find((row) => {
		      const path = text(row.path).replaceAll(String.fromCharCode(92), "/").replace(/\/+$/, "");
		      return path !== "" && (cwd === path || cwd.startsWith(`${path}/`));
		    });
		    const found = text(inside?.path);
		    if (found !== "") return found;
		  }
		  if (rows.length === 1) return text(rows[0]?.path);
		  const freshest = [...rows].map((row) => ({ row, at: Date.parse(text(row.updatedAt) || text(row.createdAt)) })).filter((entry) => Number.isFinite(entry.at)).sort((a, b) => b.at - a.at)[0];
		  return text(freshest?.row.path);
		}
		function registerWorkspaceDetection(ctx, sessions) {
		  const runtime = ctx;
		  if (typeof runtime.inject !== "function") return;
		  try {
		    runtime.inject(["workspaces"], (scope) => {
		      const workspaces = scope.workspaces;
		      const update = () => {
		        publish(derive(workspaces, sessions));
		      };
		      update();
		      for (const source of [workspaces?.list, sessions]) {
		        if (source !== void 0 && typeof source.subscribe === "function") {
		          try {
		            source.subscribe(update);
		          } catch {
		          }
		        }
		      }
		    });
		  } catch {
		  }
		}

		// src/client/locales.ts
		var ZH = {
		  "entry.label": "\u52A8\u753B",
		  "entry.tip": "\u8BA9\u8BBA\u6587/\u65B9\u6CD5\u52A8\u8D77\u6765\uFF0C\u5BFC\u51FA\u8BB2\u89E3\u89C6\u9891",
		  "tab.label": "\u52A8\u753B",
		  "guide.title": "\u52A8\u753B\u5DE5\u4F5C\u5BA4",
		  "guide.description": "\u6E32\u67D3 Manim \u573A\u666F\uFF0C\u770B\u7247\uFF0C\u51FA\u8BB2\u89E3\u89C6\u9891",
		  "panel.loading": "\u6B63\u5728\u626B\u63CF\u5DE5\u4F5C\u533A\u2026",
		  "panel.noRoot": "\u6CA1\u6709\u53EF\u7528\u7684\u5DE5\u4F5C\u533A\uFF0C\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\u9879\u76EE\u3002",
		  "panel.pickRoot": "\u9009\u4E00\u4E2A\u5DE5\u4F5C\u533A\u6765\u653E\u52A8\u753B\uFF1A",
		  "panel.pickRootHint": "\u9762\u677F\u62FF\u4E0D\u5230\u5F53\u524D\u4F1A\u8BDD\u7684\u76EE\u5F55\uFF08\u5BBF\u4E3B\u4E0D\u540C\uFF0C\u4F1A\u8BDD\u5FEB\u7167\u7684\u5F62\u72B6\u4E5F\u4E0D\u540C\uFF09\uFF0C\u6240\u4EE5\u5217\u5DF2\u6CE8\u518C\u7684\u5DE5\u4F5C\u533A\u8BA9\u4F60\u9009\u3002",
		  "video.title": "\u89C6\u9891",
		  "files.onDisk": "\u5DE5\u4F5C\u533A\u91CC\u7684\u6210\u7247",
		  "runtime.missing": "\u51FA\u7247\u8981\u7528\u771F\u6B63\u7684 Manim \u6E32\u67D3\u5668\uFF08Python\uFF0C\u7EA6 500 MB \u4F9D\u8D56\uFF09\u3002\u672C\u673A\u8FD8\u6CA1\u88C5\uFF0C\u70B9\u53F3\u8FB9\u6309\u94AE\u88C5\u4E00\u6B21\u5373\u53EF\uFF0C\u4E4B\u540E\u4E00\u76F4\u53EF\u7528\u3002",
		  "runtime.setup": "\u5B89\u88C5\u6E32\u67D3\u5668",
		  "runtime.building": "\u6B63\u5728\u5B89\u88C5\u6E32\u67D3\u5668\uFF08Python + Manim\uFF0C\u7EA6 500 MB\uFF09\uFF0C\u8BF7\u4FDD\u6301\u7A97\u53E3\u6253\u5F00\u2026",
		  "runtime.phase.preparing": "\u51C6\u5907\u4E2D",
		  "video.loading": "\u6B63\u5728\u8BFB\u53D6\u89C6\u9891\u2026",
		  "panel.empty": "\u5DE5\u4F5C\u533A\u91CC\u8FD8\u6CA1\u6709\u573A\u666F\u6587\u4EF6",
		  "panel.emptyHint": "\u70B9\u300C\u65B0\u573A\u666F\u300D\u751F\u6210\u4E00\u4E2A\u5E26\u4E3B\u9898\u548C\u5B57\u5E55\u7684\u8D77\u59CB\u573A\u666F\uFF0C\u7136\u540E\u8BA9 agent \u6309\u4F60\u8981\u8BB2\u7684\u8BBA\u6587/\u65B9\u6CD5\u6539\u5B83\u3002",
		  "panel.refresh": "\u5237\u65B0",
		  "panel.error": "\u51FA\u9519\u4E86\uFF1A{message}",
		  "files.toggle": "\u6587\u4EF6",
		  "files.title": "\u5DF2\u6E32\u67D3\u7684\u89C6\u9891",
		  "files.tip": "\u5207\u6362\u770B\u54EA\u4E00\u6761\u6210\u7247\uFF08\u6BCF\u4E2A\u753B\u8D28\u5404\u7B97\u4E00\u6761\uFF09",
		  "files.empty": "\u8FD8\u6CA1\u6709\u6E32\u67D3\u7ED3\u679C\uFF0C\u5148\u6E32\u67D3\u4E00\u6761",
		  "scene.title": "\u573A\u666F\u6587\u4EF6",
		  "scene.count": "{count} \u4E2A",
		  "scene.never": "\u672A\u6E32\u67D3",
		  "scene.rendered": "\u4E0A\u6B21 {quality} \xB7 {duration}",
		  "scene.new": "\u65B0\u573A\u666F",
		  "scene.newPrompt": "\u65B0\u573A\u666F\u7684\u540D\u5B57\uFF08\u751F\u6210 animations/<\u540D\u5B57>.py\uFF09",
		  "scene.creating": "\u6B63\u5728\u521B\u5EFA\u2026",
		  "scene.class": "\u573A\u666F\u7C7B",
		  "scene.multiple": "\u8FD9\u4E2A\u6587\u4EF6\u91CC\u6709\u591A\u4E2A\u573A\u666F\uFF0C\u70B9\u4E00\u4E2A\u5F00\u59CB\u6E32\u67D3",
		  "quality.label": "\u753B\u8D28",
		  "quality.draftHint": "\u6539\u5185\u5BB9\u65F6\u7528\u8349\u7A3F\uFF0C\u5B9A\u7A3F\u518D\u51FA\u9AD8\u6E05",
		  "render.start": "\u5F00\u59CB\u6E32\u67D3",
		  "render.cancel": "\u53D6\u6D88",
		  "render.planning": "\u6B63\u5728\u8BA1\u5212\uFF08\u6D4B\u91CF\u52A8\u753B\u6BB5\u6570\u4E0E\u603B\u65F6\u957F\uFF09\u2026",
		  "render.running": "\u6E32\u67D3\u4E2D",
		  "render.done": "\u6E32\u67D3\u5B8C\u6210",
		  "render.failed": "\u6E32\u67D3\u5931\u8D25",
		  "render.cancelled": "\u5DF2\u53D6\u6D88",
		  "render.busy": "\u8FD9\u4E2A\u573A\u666F\u6B63\u5728\u6E32\u67D3",
		  "render.stage": "\u7B2C {done}/{total} \u6BB5",
		  "render.stageUnknown": "\u7B2C {done} \u6BB5",
		  "render.elapsed": "\u5DF2\u7528 {time}",
		  "render.remaining": "\u9884\u8BA1\u8FD8\u9700 {time}",
		  "render.duration": "\u65F6\u957F {time}",
		  "render.plays": "{count} \u6BB5\u52A8\u753B",
		  "render.noServe": "\u8FD8\u6CA1\u6709\u53EF\u64AD\u653E\u7684\u6210\u7247",
		  "player.title": "\u6210\u7247",
		  "player.output": "\u5DF2\u8F93\u51FA\u5230 {path}",
		  "player.cache": "\uFF08\u7F13\u5B58\u526F\u672C {path}\uFF09",
		  "player.open": "\u64AD\u653E",
		  "board.title": "\u5206\u955C",
		  "board.generate": "\u62BD\u53D6\u5206\u955C",
		  "board.generating": "\u6B63\u5728\u62BD\u5E27\u2026",
		  "board.empty": "\u8FD8\u6CA1\u6709\u5206\u955C\uFF1B\u6E32\u67D3\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u751F\u6210",
		  "board.seek": "\u8DF3\u5230\u7B2C {time} \u79D2",
		  "board.hint": "\u70B9\u4E00\u5E27\u8DF3\u5230\u90A3\u4E00\u523B",
		  "log.title": "\u65E5\u5FD7",
		  "log.empty": "\uFF08\u6682\u65E0\u8F93\u51FA\uFF09",
		  "log.show": "\u5C55\u5F00\u65E5\u5FD7",
		  "log.hide": "\u6536\u8D77\u65E5\u5FD7",
		  "log.copy": "\u590D\u5236",
		  "probe.title": "\u8FD0\u884C\u65F6",
		  "probe.ready": "Manim {version} \u5C31\u7EEA",
		  "probe.missing": "\u8FD0\u884C\u65F6\u8FD8\u6CA1\u88C5\u597D",
		  "probe.missingHint": '\u5728\u7EC8\u7AEF\u8DD1\u4E00\u904D\uFF1Anode "{path}"',
		  "probe.noTex": "LaTeX \u4E0D\u53EF\u7528\uFF1A\u516C\u5F0F\u8BF7\u7528 manimkit.mathtex()",
		  "probe.tex": "LaTeX \u53EF\u7528\uFF1AMathTex/Tex \u6B63\u5E38",
		  "probe.run": "\u81EA\u68C0",
		  "time.seconds": "{value} \u79D2",
		  "time.minutes": "{value} \u5206",
		  "time.minutesSeconds": "{minutes} \u5206 {seconds} \u79D2",
		  "time.unknown": "\u672A\u77E5"
		};
		var EN = {
		  "entry.label": "Animation",
		  "entry.tip": "Turn a paper or method into an explainer video",
		  "tab.label": "Animation",
		  "guide.title": "Animation studio",
		  "guide.description": "Render Manim scenes, watch them, export an explainer",
		  "panel.loading": "Scanning the workspace\u2026",
		  "panel.noRoot": "No workspace available \u2014 open a session project first.",
		  "panel.pickRoot": "Pick a workspace for the animations:",
		  "panel.pickRootHint": "This panel cannot read the current session directory (session snapshots differ between shells), so it lists the registered workspaces instead.",
		  "video.title": "Video",
		  "files.onDisk": "Films already in the workspace",
		  "runtime.missing": "Rendering needs the real Manim renderer (Python, ~500 MB of packages). It is not installed on this machine yet \u2014 install it once here and it stays.",
		  "runtime.setup": "Install renderer",
		  "runtime.building": "Installing the renderer (Python + Manim, ~500 MB). Keep this window open\u2026",
		  "runtime.phase.preparing": "Preparing",
		  "video.loading": "Loading video\u2026",
		  "panel.empty": "No scene files in this workspace yet",
		  "panel.emptyHint": 'Press "New scene" to scaffold a themed starter, then have the agent adapt it to your paper or method.',
		  "panel.refresh": "Refresh",
		  "panel.error": "Failed: {message}",
		  "files.toggle": "Files",
		  "files.title": "Rendered videos",
		  "files.tip": "Switch which finished video you are watching (one entry per quality)",
		  "files.empty": "Nothing rendered yet \u2014 render one first",
		  "scene.title": "Scene files",
		  "scene.count": "{count} files",
		  "scene.never": "never rendered",
		  "scene.rendered": "last {quality} \xB7 {duration}",
		  "scene.new": "New scene",
		  "scene.newPrompt": "Name for the new scene (creates animations/<name>.py)",
		  "scene.creating": "Creating\u2026",
		  "scene.class": "Scene class",
		  "scene.multiple": "This file defines several scenes \u2014 pick one to render",
		  "quality.label": "Quality",
		  "quality.draftHint": "Iterate on draft, render the final cut at high quality",
		  "render.start": "Render",
		  "render.cancel": "Cancel",
		  "render.planning": "Planning (measuring animation count and duration)\u2026",
		  "render.running": "Rendering",
		  "render.done": "Render finished",
		  "render.failed": "Render failed",
		  "render.cancelled": "Cancelled",
		  "render.busy": "This scene is already rendering",
		  "render.stage": "Animation {done}/{total}",
		  "render.stageUnknown": "Animation {done}",
		  "render.elapsed": "{time} elapsed",
		  "render.remaining": "about {time} left",
		  "render.duration": "{time} long",
		  "render.plays": "{count} animations",
		  "render.noServe": "No finished video yet",
		  "player.title": "Video",
		  "player.output": "Written to {path}",
		  "player.cache": "(cache copy {path})",
		  "player.open": "Play",
		  "board.title": "Storyboard",
		  "board.generate": "Extract frames",
		  "board.generating": "Extracting\u2026",
		  "board.empty": "No storyboard yet \u2014 it is generated after a render",
		  "board.seek": "Seek to {time}s",
		  "board.hint": "Click a frame to jump there",
		  "log.title": "Log",
		  "log.empty": "(no output yet)",
		  "log.show": "Show log",
		  "log.hide": "Hide log",
		  "log.copy": "Copy",
		  "probe.title": "Runtime",
		  "probe.ready": "Manim {version} ready",
		  "probe.missing": "Runtime is not installed",
		  "probe.missingHint": 'Run this in a terminal: node "{path}"',
		  "probe.noTex": "LaTeX unavailable \u2014 use manimkit.mathtex() for formulas",
		  "probe.tex": "LaTeX available \u2014 MathTex/Tex work",
		  "probe.run": "Check",
		  "time.seconds": "{value}s",
		  "time.minutes": "{value}m",
		  "time.minutesSeconds": "{minutes}m {seconds}s",
		  "time.unknown": "unknown"
		};

		// src/client/i18n.ts
		var DICTS = { zh: ZH, en: EN };
		function currentLang() {
		  return typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "zh";
		}
		function lookup(lang, key, params = {}) {
		  let text2 = DICTS[lang][key] ?? DICTS.zh[key] ?? key;
		  for (const [name2, value] of Object.entries(params)) {
		    text2 = text2.replaceAll(`{${name2}}`, String(value));
		  }
		  return text2;
		}
		function t(key, params = {}) {
		  return lookup(currentLang(), key, params);
		}
		function formatDuration(seconds) {
		  if (seconds === null || seconds === void 0 || !Number.isFinite(seconds) || seconds < 0) {
		    return t("time.unknown");
		  }
		  if (seconds < 60) return t("time.seconds", { value: seconds.toFixed(1) });
		  const minutes = Math.floor(seconds / 60);
		  const rest = Math.round(seconds - minutes * 60);
		  if (rest === 0) return t("time.minutes", { value: minutes });
		  return t("time.minutesSeconds", { minutes, seconds: rest });
		}

		// src/client/studio.module.css
		var studio_default = {
		  railMark: "studio_railMark",
		  studioMark: "studio_studioMark",
		  titleIcon: "studio_titleIcon",
		  studio: "studio_studio",
		  notice: "studio_notice",
		  muted: "studio_muted",
		  small: "studio_small",
		  ellipsis: "studio_ellipsis",
		  error: "studio_error",
		  toolbar: "studio_toolbar",
		  fileMenu: "studio_fileMenu",
		  qualityMenu: "studio_qualityMenu",
		  iconOnly: "studio_iconOnly",
		  stage: "studio_stage",
		  stageMain: "studio_stageMain",
		  stageSide: "studio_stageSide",
		  sectionFlat: "studio_sectionFlat",
		  player: "studio_player",
		  video: "studio_video",
		  playerEmpty: "studio_playerEmpty",
		  status: "studio_status",
		  statusLine: "studio_statusLine",
		  stateOk: "studio_stateOk",
		  stateBad: "studio_stateBad",
		  bar: "studio_bar",
		  barFill: "studio_barFill",
		  barIndeterminate: "studio_barIndeterminate",
		  manimSweep: "studio_manimSweep",
		  section: "studio_section",
		  sectionHead: "studio_sectionHead",
		  sectionTitle: "studio_sectionTitle",
		  board: "studio_board",
		  boardCell: "studio_boardCell",
		  boardImg: "studio_boardImg",
		  boardTime: "studio_boardTime",
		  scenes: "studio_scenes",
		  sceneRow: "studio_sceneRow",
		  sceneRowActive: "studio_sceneRowActive",
		  sceneName: "studio_sceneName",
		  sceneMeta: "studio_sceneMeta",
		  sceneDot: "studio_sceneDot",
		  chips: "studio_chips",
		  chip: "studio_chip",
		  chipActive: "studio_chipActive",
		  log: "studio_log",
		  rootPicker: "studio_rootPicker",
		  rootPickerTitle: "studio_rootPickerTitle",
		  rootPickerHint: "studio_rootPickerHint",
		  rootItem: "studio_rootItem",
		  rootItemName: "studio_rootItemName",
		  rootItemPath: "studio_rootItemPath",
		  documentVideoWrap: "studio_documentVideoWrap",
		  documentVideo: "studio_documentVideo",
		  setupBar: "studio_setupBar",
		  setupBarFill: "studio_setupBarFill"
		};

		// src/client/studio.tsx
		var import_jsx_runtime2 = require("react/jsx-runtime");
		function cx(...names) {
		  return names.filter((name2) => typeof name2 === "string").map((name2) => studio_default[name2]).join(" ");
		}
		var MEMORY = /* @__PURE__ */ new Map();
		var MEMORY_LIMIT = 6;
		var chosenRoot = "";
		function memoryFor(root) {
		  const existing = MEMORY.get(root);
		  if (existing !== void 0) return existing;
		  const fresh = { selected: "", sceneClass: null, quality: null };
		  MEMORY.set(root, fresh);
		  if (MEMORY.size > MEMORY_LIMIT) {
		    const oldest = MEMORY.keys().next().value;
		    if (oldest !== void 0 && oldest !== root) MEMORY.delete(oldest);
		  }
		  return fresh;
		}
		function currentRoot(sessions) {
		  if (sessions === void 0 || typeof sessions.getSnapshot !== "function") return "";
		  let snapshot;
		  try {
		    snapshot = sessions.getSnapshot();
		  } catch {
		    return "";
		  }
		  if (snapshot === null || typeof snapshot !== "object") return "";
		  const view = snapshot;
		  const pick = (value) => typeof value === "string" && value !== "" ? value : "";
		  const current = view.current ?? view.currentId ?? view.activeId ?? view.active;
		  if (current !== null && typeof current === "object") {
		    const direct = pick(current.cwd);
		    if (direct !== "") return direct;
		  }
		  const id = typeof current === "string" ? current : "";
		  const byId = view.byId ?? view.sessions ?? view.items;
		  const fromMap = () => {
		    if (byId === null || byId === void 0) return "";
		    if (Array.isArray(byId)) {
		      const hit2 = byId.find((row) => row !== null && typeof row === "object" && pick(row.id ?? row.sessionId) === id);
		      return hit2 === void 0 ? "" : pick(hit2.cwd);
		    }
		    if (typeof byId !== "object") return "";
		    const hit = byId[id];
		    if (hit !== null && typeof hit === "object") return pick(hit.cwd);
		    return "";
		  };
		  const mapped = fromMap();
		  if (mapped !== "") return mapped;
		  const rows = Array.isArray(byId) ? byId : byId !== null && typeof byId === "object" ? Object.values(byId) : [];
		  const cwds = rows.map((row) => row !== null && typeof row === "object" ? pick(row.cwd) : "").filter((cwd) => cwd !== "");
		  return cwds.length === 1 ? cwds[0] : "";
		}
		function currentSessionId2(sessions) {
		  if (sessions === void 0 || typeof sessions.getSnapshot !== "function") return "";
		  let snapshot;
		  try {
		    snapshot = sessions.getSnapshot();
		  } catch {
		    return "";
		  }
		  if (snapshot === null || typeof snapshot !== "object") return "";
		  const view = snapshot;
		  for (const key of ["current", "currentId", "selected", "activeId"]) {
		    const value = view[key];
		    if (typeof value === "string" && value !== "") return value;
		    if (value !== null && typeof value === "object") {
		      const nested = value.id ?? value.sessionId;
		      if (typeof nested === "string" && nested !== "") return nested;
		    }
		  }
		  return "";
		}
		function useSession(sessions) {
		  const [state, setState] = (0, import_react.useState)(() => ({ root: currentRoot(sessions), id: currentSessionId2(sessions) }));
		  (0, import_react.useEffect)(() => {
		    if (sessions === void 0 || typeof sessions.subscribe !== "function") return;
		    return sessions.subscribe(() => setState({ root: currentRoot(sessions), id: currentSessionId2(sessions) }));
		  }, [sessions]);
		  return state;
		}
		function useDetectedRoot() {
		  const [root, setRoot] = (0, import_react.useState)(() => detectedWorkspaceRoot());
		  (0, import_react.useEffect)(() => subscribeWorkspaceRoot(() => setRoot(detectedWorkspaceRoot())), []);
		  return root;
		}
		function SceneRow({
		  entry,
		  active,
		  render,
		  onSelect
		}) {
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: cx("sceneRow", active && "sceneRowActive"), onClick: onSelect, children: [
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("sceneName"), children: entry.rel }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: cx("sceneMeta"), children: [
		      entry.scenes.join(", "),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("sceneDot"), children: "\xB7" }),
		      render === void 0 ? t("scene.never") : t("scene.rendered", { quality: render.quality, duration: formatDuration(render.duration) })
		    ] })
		  ] });
		}
		function StudioView(props) {
		  const {
		    data,
		    selected,
		    sceneClass,
		    quality,
		    job,
		    frames,
		    error,
		    busy,
		    showLog,
		    onSelect,
		    onSceneClass,
		    onQuality,
		    onRender,
		    onCancel,
		    onRefresh,
		    onStoryboard,
		    onNewScene,
		    onToggleLog,
		    frameUrl,
		    videoUrl,
		    onSeek,
		    videoRef,
		    videoFile,
		    onSelectVideo,
		    runtimeHint,
		    onSetupRuntime,
		    setupProgress
		  } = props;
		  const entry = data?.scenes.find((scene) => scene.path === selected) ?? null;
		  const qualities = data?.qualities ?? [];
		  const activeQuality = qualities.find((option) => option.id === quality) ?? qualities[0];
		  const [qualityOpen, setQualityOpen] = (0, import_react.useState)(false);
		  const [fileOpen, setFileOpen] = (0, import_react.useState)(false);
		  const renders = (0, import_react.useMemo)(
		    () => (data?.scenes ?? []).flatMap((scene) => scene.renders.map((render) => ({ render, rel: scene.rel }))).sort((a, b) => b.render.at - a.render.at),
		    [data]
		  );
		  const diskVideos = data?.videos ?? [];
		  const currentRenderKey = entry === null || activeQuality === void 0 ? "" : `${entry.path}|${activeQuality.id}|${sceneClass ?? ""}`;
		  const record = (() => {
		    if (entry === null) return void 0;
		    return entry.renders.find((item) => item.quality === quality && (sceneClass === null || item.scene === sceneClass)) ?? entry.renders.find((item) => item.quality === quality);
		  })();
		  const liveJob = job !== null && job.path === selected ? job : null;
		  const running = liveJob !== null && liveJob.endedAt === null;
		  const progress = liveJob?.progress;
		  const statusText = (() => {
		    if (liveJob === null) return "";
		    switch (liveJob.state) {
		      case "planning":
		        return t("render.planning");
		      case "rendering":
		        return progress?.total == null ? t("render.stageUnknown", { done: progress?.done ?? 1 }) : t("render.stage", { done: (progress?.done ?? 0) + 1, total: progress.total });
		      case "done":
		        return t("render.done");
		      case "cancelled":
		        return t("render.cancelled");
		      default:
		        return t("render.failed");
		    }
		  })();
		  const percent = progress?.fraction == null ? null : Math.round(progress.fraction * 100);
		  const remaining = progress !== void 0 && progress.fraction !== null && progress.fraction > 0.02 ? progress.elapsed / progress.fraction - progress.elapsed : null;
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("studio"), "data-dsh-manim-pane": "", children: [
		    data === null && error === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("notice"), children: t("panel.loading") }) : null,
		    runtimeHint !== void 0 && runtimeHint !== "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("error"), children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: runtimeHint }),
		      onSetupRuntime === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ShellButton, { size: "sm", variant: "primary", disabled: busy, onClick: onSetupRuntime, children: t("runtime.setup") }),
		      setupProgress === void 0 || setupProgress === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("setupBar"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "div",
		          {
		            className: cx("setupBarFill"),
		            style: { width: `${Math.max(1, Math.min(100, setupProgress.percent))}%` },
		            "data-dsh-manim-setup-bar": String(setupProgress.percent)
		          }
		        ) }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("small"), children: `${setupProgress.phase} ${setupProgress.percent}%` })
		      ] })
		    ] }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("toolbar"), children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        ShellMenu,
		        {
		          open: fileOpen,
		          anchor: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            ShellButton,
		            {
		              size: "sm",
		              variant: "ghost",
		              icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconFolderOpen, {}),
		              title: t("files.tip"),
		              disabled: renders.length === 0 && diskVideos.length === 0,
		              onClick: () => setFileOpen((open) => !open),
		              children: t("files.toggle")
		            }
		          ),
		          items: renders.length === 0 && diskVideos.length === 0 ? [{ type: "label", text: t("files.empty") }] : [
		            ...renders.length === 0 ? [] : [
		              { type: "label", text: t("files.title") },
		              ...renders.map(({ render, rel }) => ({
		                id: `${render.sceneFile}|${render.quality}|${render.scene}`,
		                label: `${render.scene} \xB7 ${render.quality} \xB7 ${formatDuration(render.duration)}`,
		                // The scene file is what disambiguates two scenes that
		                // share a class name, and what the user recognises.
		                description: rel
		              }))
		            ],
		            // Films that exist on disk but were not rendered by this
		            // installation (another DSH home, an earlier install, a hand
		            // export). Without these the menu claims "no finished film"
		            // over a workspace full of them.
		            ...diskVideos.length === 0 ? [] : [
		              { type: "label", text: t("files.onDisk") },
		              ...diskVideos.map((video) => ({
		                id: `file:${video.rel}`,
		                label: video.name,
		                description: video.rel
		              }))
		            ]
		          ],
		          selectedId: videoFile !== void 0 && videoFile !== "" ? `file:${videoFile}` : currentRenderKey,
		          onSelect: (id) => {
		            const raw = String(id);
		            if (raw.startsWith("file:")) {
		              onSelectVideo?.(raw.slice("file:".length));
		              setFileOpen(false);
		              return;
		            }
		            const [sceneFile, qualityId, sceneName] = raw.split("|");
		            if (sceneFile !== void 0 && sceneFile !== "") onSelect(sceneFile);
		            if (sceneName !== void 0 && sceneName !== "") onSceneClass(sceneName);
		            if (qualityId !== void 0 && qualityId !== "") onQuality(qualityId);
		            setFileOpen(false);
		          },
		          onClose: () => setFileOpen(false),
		          portal: true,
		          align: "start",
		          className: cx("fileMenu")
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        ShellMenu,
		        {
		          open: qualityOpen,
		          anchor: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            ShellButton,
		            {
		              size: "sm",
		              variant: "ghost",
		              icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconChevronDown, {}),
		              title: t("quality.draftHint"),
		              disabled: qualities.length === 0,
		              onClick: () => setQualityOpen((open) => !open),
		              children: activeQuality?.label ?? t("quality.label")
		            }
		          ),
		          items: qualities.map((option) => ({ id: option.id, label: option.label })),
		          selectedId: activeQuality?.id,
		          onSelect: (id) => {
		            onQuality(String(id));
		            setQualityOpen(false);
		          },
		          onClose: () => setQualityOpen(false),
		          portal: true,
		          align: "start",
		          className: cx("qualityMenu")
		        }
		      ),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        ShellButton,
		        {
		          size: "sm",
		          variant: "primary",
		          icon: running ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconLoading, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconPlay, {}),
		          onClick: onRender,
		          disabled: busy || running || entry === null || sceneClass === null,
		          children: running ? t("render.running") : t("render.start")
		        }
		      ),
		      running ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ShellButton, { size: "sm", variant: "ghost", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconStop, {}), onClick: onCancel, children: t("render.cancel") }) : null,
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        ShellButton,
		        {
		          size: "sm",
		          variant: "ghost",
		          className: cx("iconOnly"),
		          icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconRefresh, {}),
		          onClick: onRefresh,
		          title: t("panel.refresh"),
		          "aria-label": t("panel.refresh")
		        }
		      )
		    ] }),
		    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("error"), children: t("panel.error", { message: error }) }) : null,
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("stage"), "data-dsh-manim-stage": "", children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("stageMain"), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("player"), "data-dsh-manim-player": "", children: videoUrl === null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("playerEmpty"), children: t("render.noServe") }) : (
		          // `key` forces a fresh element when the source changes: reusing the
		          // element across two renders keeps the previous video's currentTime
		          // and duration until the new metadata lands, which reads as the wrong
		          // video for a moment.
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("video", { ref: videoRef, className: cx("video"), src: videoUrl, controls: true, preload: "metadata" }, videoUrl)
		        ) }),
		        liveJob !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("status"), "data-dsh-manim-status": liveJob.state, children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("statusLine"), children: [
		            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: liveJob.state === "failed" ? cx("stateBad") : cx("stateOk"), children: statusText }),
		            progress !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("muted"), children: t("render.elapsed", { time: formatDuration(progress.elapsed) }) }) : null,
		            remaining !== null && running ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("muted"), children: t("render.remaining", { time: formatDuration(remaining) }) }) : null,
		            liveJob.result !== null && liveJob.result.duration !== null ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("muted"), children: t("render.duration", { time: formatDuration(liveJob.result.duration) }) }) : null
		          ] }),
		          running ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("bar"), "data-dsh-manim-bar": percent === null ? "indeterminate" : String(percent), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            "div",
		            {
		              className: cx("barFill", percent === null && "barIndeterminate"),
		              style: percent === null ? void 0 : { width: `${percent}%` }
		            }
		          ) }) : null,
		          progress?.label ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("muted", "ellipsis"), children: progress.label }) : null,
		          liveJob.error !== null && liveJob.error !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("error"), children: liveJob.error.message }) : null
		        ] }) : null
		      ] }),
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("stageSide"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("section", "sectionFlat"), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("sectionHead"), children: [
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("sectionTitle"), children: t("board.title") }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("muted"), children: t("board.hint") }),
		          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		            ShellButton,
		            {
		              size: "sm",
		              variant: "ghost",
		              icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconDownload, {}),
		              onClick: onStoryboard,
		              disabled: busy || entry === null,
		              children: busy ? t("board.generating") : t("board.generate")
		            }
		          )
		        ] }),
		        frames.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("muted", "small"), children: t("board.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("board"), "data-dsh-manim-board": frames.length, children: frames.map((frame) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		          "button",
		          {
		            type: "button",
		            className: cx("boardCell"),
		            title: t("board.seek", { time: frame.time.toFixed(1) }),
		            onClick: () => onSeek(frame.time),
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { className: cx("boardImg"), src: frameUrl(frame.path), alt: `${frame.time.toFixed(1)}s`, loading: "lazy" }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: cx("boardTime"), children: [
		                frame.time.toFixed(1),
		                "s"
		              ] })
		            ]
		          },
		          `${frame.time}-${frame.path}`
		        )) })
		      ] }) })
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("section"), children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("sectionHead"), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("sectionTitle"), children: t("scene.title") }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("muted"), children: t("scene.count", { count: data?.scenes.length ?? 0 }) }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ShellButton, { size: "sm", variant: "ghost", icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconPlus, {}), onClick: onNewScene, disabled: busy, children: busy ? t("scene.creating") : t("scene.new") })
		      ] }),
		      data !== null && data.scenes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("muted", "small"), children: t("panel.emptyHint") }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("scenes"), "data-dsh-manim-scenes": data?.scenes.length ?? 0, children: (data?.scenes ?? []).map((sceneEntry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		        SceneRow,
		        {
		          entry: sceneEntry,
		          active: sceneEntry.path === selected,
		          render: sceneEntry.renders.find((item) => item.quality === quality),
		          onSelect: () => onSelect(sceneEntry.path)
		        },
		        sceneEntry.path
		      )) }),
		      entry !== null && entry.scenes.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("chips"), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("muted", "small"), children: t("scene.class") }),
		        entry.scenes.map((name2) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		          "button",
		          {
		            type: "button",
		            className: cx("chip", name2 === sceneClass && "chipActive"),
		            onClick: () => onSceneClass(name2),
		            children: name2
		          },
		          name2
		        ))
		      ] }) : null
		    ] }),
		    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("section"), children: [
		      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("sectionHead"), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("sectionTitle"), children: t("log.title") }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ShellButton, { size: "sm", variant: "ghost", onClick: onToggleLog, children: showLog ? t("log.hide") : t("log.show") })
		      ] }),
		      liveJob?.result?.output !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("small", "muted", "ellipsis"), title: liveJob.result.output, children: t("player.output", { path: liveJob.result.output }) }) : record?.output !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("small", "muted", "ellipsis"), title: record.output, children: t("player.output", { path: record.output }) }) : null,
		      showLog ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: cx("log"), children: liveJob !== null && liveJob.log.length > 0 ? liveJob.log.join("\n") : t("log.empty") }) : null
		    ] })
		  ] });
		}
		function Studio({ makeApi: makeApi2, sessions }) {
		  const session = useSession(sessions);
		  const detected2 = useDetectedRoot();
		  const sessionRoot = detected2 !== "" ? detected2 : session.root;
		  const [picked, setPicked] = (0, import_react.useState)(chosenRoot);
		  const [roots, setRoots] = (0, import_react.useState)(null);
		  const root = sessionRoot !== "" ? sessionRoot : picked;
		  const api = (0, import_react.useMemo)(() => root === "" ? null : makeApi2(root), [makeApi2, root]);
		  (0, import_react.useEffect)(() => {
		    if (sessionRoot !== "" || picked !== "") return;
		    let live = true;
		    const api2 = makeApi2("");
		    void (async () => {
		      if (session.id !== "") {
		        const remembered = rememberedPick(session.id);
		        if (remembered !== "") {
		          chosenRoot = remembered;
		          setPicked(remembered);
		          return;
		        }
		        try {
		          const resolved = await api2.sessionRoot(session.id, session.root);
		          if (live && typeof resolved.path === "string" && resolved.path !== "") {
		            chosenRoot = resolved.path;
		            setPicked(resolved.path);
		            return;
		          }
		        } catch {
		        }
		      }
		      try {
		        const value = await api2.workspaces();
		        if (!live) return;
		        const list = value.roots ?? [];
		        setRoots(list);
		        if (list.length === 1) {
		          chosenRoot = list[0].path;
		          setPicked(list[0].path);
		        }
		      } catch {
		        if (live) setRoots([]);
		      }
		    })();
		    return () => {
		      live = false;
		    };
		  }, [makeApi2, sessionRoot, picked, session.id]);
		  const memory = (0, import_react.useMemo)(() => memoryFor(root), [root]);
		  const [data, setData] = (0, import_react.useState)(null);
		  const [selected, setSelected] = (0, import_react.useState)(memory.selected);
		  const [sceneClass, setSceneClass] = (0, import_react.useState)(memory.sceneClass);
		  const [quality, setQuality] = (0, import_react.useState)(memory.quality);
		  const [job, setJob] = (0, import_react.useState)(null);
		  const [frames, setFrames] = (0, import_react.useState)([]);
		  const [error, setError] = (0, import_react.useState)(null);
		  const [busy, setBusy] = (0, import_react.useState)(false);
		  const [showLog, setShowLog] = (0, import_react.useState)(false);
		  const [videoFile, setVideoFile] = (0, import_react.useState)("");
		  const [runtimeHint, setRuntimeHint] = (0, import_react.useState)("");
		  const [setupBusy, setSetupBusy] = (0, import_react.useState)(false);
		  const [setupProgress, setSetupProgress] = (0, import_react.useState)(null);
		  const videoRef = (0, import_react.useRef)(null);
		  const refreshedFor = (0, import_react.useRef)("");
		  const framesKey = (0, import_react.useRef)("");
		  const watchSetup = (0, import_react.useCallback)(async () => {
		    if (api === null) return;
		    try {
		      for (; ; ) {
		        await new Promise((resolve) => setTimeout(resolve, 900));
		        const status = await api.setupStatus();
		        if (status.state === "running") {
		          setSetupProgress((previous) => {
		            const reported = Math.round(status.percent ?? 0);
		            const crept = previous === null ? 1 : Math.min(97, previous.percent + 1);
		            return { phase: status.phase ?? "\u51C6\u5907\u4E2D", percent: Math.max(reported, crept) };
		          });
		          continue;
		        }
		        setSetupProgress({ phase: status.phase ?? "", percent: 100 });
		        if (status.state === "done") {
		          setRuntimeHint("");
		        } else if (status.state === "failed") {
		          setRuntimeHint(status.error !== void 0 && status.error !== "" ? status.error : t("runtime.missing"));
		        }
		        break;
		      }
		    } catch (failure) {
		      setRuntimeHint(failure instanceof Error ? failure.message : String(failure));
		    } finally {
		      setSetupBusy(false);
		      setSetupProgress(null);
		    }
		  }, [api]);
		  const setupRuntime = (0, import_react.useCallback)(async () => {
		    if (api === null || setupBusy) return;
		    setSetupBusy(true);
		    setSetupProgress({ phase: t("runtime.phase.preparing"), percent: 0 });
		    try {
		      await api.setupRuntime();
		    } catch (failure) {
		      setRuntimeHint(failure instanceof Error ? failure.message : String(failure));
		      setSetupBusy(false);
		      setSetupProgress(null);
		      return;
		    }
		    await watchSetup();
		  }, [api, setupBusy, watchSetup]);
		  (0, import_react.useEffect)(() => {
		    if (api === null) return;
		    let live = true;
		    void api.probe({}).then(async (value) => {
		      if (!live) return;
		      setRuntimeHint(value.pythonPresent === true ? "" : t("runtime.missing"));
		      if (value.pythonPresent !== true) {
		        const status = await api.setupStatus().catch(() => null);
		        if (status?.state === "running") {
		          setSetupBusy(true);
		          void watchSetup();
		        }
		      }
		    }).catch(() => {
		      if (live) setRuntimeHint("");
		    });
		    return () => {
		      live = false;
		    };
		  }, [api, watchSetup]);
		  const load = (0, import_react.useCallback)(
		    async (refresh = false) => {
		      if (api === null) return;
		      try {
		        const next = await api.list({ root, refresh });
		        setData(next);
		        setError(null);
		        setSelected((current) => {
		          if (current !== "" && next.scenes.some((scene) => scene.path === current)) return current;
		          return next.scenes[0]?.path ?? "";
		        });
		        setQuality((current) => current ?? next.defaultQuality);
		      } catch (failure) {
		        setError(failure instanceof Error ? failure.message : String(failure));
		      }
		    },
		    [api, root]
		  );
		  (0, import_react.useEffect)(() => {
		    void load();
		  }, [load]);
		  (0, import_react.useEffect)(() => {
		    if (api === null) return;
		    const onFocus = () => void load(true);
		    window.addEventListener("focus", onFocus);
		    return () => window.removeEventListener("focus", onFocus);
		  }, [api, load]);
		  const entry = (0, import_react.useMemo)(() => data?.scenes.find((scene) => scene.path === selected) ?? null, [data, selected]);
		  const activeQuality = (0, import_react.useMemo)(
		    () => data?.qualities.find((option) => option.id === quality) ?? data?.qualities[0],
		    [data, quality]
		  );
		  const record = (0, import_react.useMemo)(() => {
		    if (entry === null) return void 0;
		    return entry.renders.find((item) => item.quality === quality && (sceneClass === null || item.scene === sceneClass)) ?? entry.renders.find((item) => item.quality === quality);
		  }, [entry, quality, sceneClass]);
		  const liveJob = job !== null && job.path === selected ? job : null;
		  const running = liveJob !== null && liveJob.endedAt === null;
		  const recordKey = record === void 0 ? "" : `${record.sceneFile}|${record.scene}|${record.quality}|${record.at}`;
		  const videoUrl = (0, import_react.useMemo)(() => {
		    if (api === null) return null;
		    if (liveJob !== null && liveJob.state === "done" && liveJob.result !== null) return api.videoUrl({ id: liveJob.id });
		    if (videoFile !== "") return api.videoUrl({ file: videoFile });
		    if (record !== void 0) return api.videoUrl({ path: record.sceneFile, scene: record.scene, quality: record.quality });
		    return null;
		  }, [api, liveJob, record, videoFile]);
		  (0, import_react.useEffect)(() => {
		    memory.selected = selected;
		    memory.sceneClass = sceneClass;
		    memory.quality = quality;
		  }, [memory, selected, sceneClass, quality]);
		  const lastSelected = (0, import_react.useRef)("");
		  (0, import_react.useEffect)(() => {
		    if (entry === null || lastSelected.current === entry.path) return;
		    lastSelected.current = entry.path;
		    setSceneClass(
		      (current) => current !== null && entry.scenes.includes(current) ? current : entry.scenes.length === 1 ? entry.scenes[0] : null
		    );
		    setJob(null);
		    setFrames([]);
		    framesKey.current = "";
		  }, [entry]);
		  const liveJobId = liveJob?.id ?? "";
		  const liveJobEnded = liveJob?.endedAt ?? null;
		  (0, import_react.useEffect)(() => {
		    if (api === null || liveJobId === "" || liveJobEnded !== null) return;
		    let cancelled = false;
		    const timer = setInterval(() => {
		      void (async () => {
		        try {
		          const next = await api.job({ id: liveJobId });
		          if (cancelled) return;
		          setJob(next.job);
		          if (next.job.frames.length > 0) setFrames(next.job.frames);
		        } catch (failure) {
		          if (cancelled) return;
		          if (failure instanceof ManimApiError && failure.code === "not-found") {
		            setJob(null);
		            void load(true);
		          } else {
		            setError(failure instanceof Error ? failure.message : String(failure));
		          }
		        }
		      })();
		    }, 600);
		    return () => {
		      cancelled = true;
		      clearInterval(timer);
		    };
		  }, [api, liveJobId, liveJobEnded, load]);
		  (0, import_react.useEffect)(() => {
		    if (api === null || liveJob === null || liveJob.state !== "done" || liveJob.result === null) return;
		    if (refreshedFor.current === liveJob.id) return;
		    refreshedFor.current = liveJob.id;
		    const timer = setTimeout(() => void load(true), 400);
		    return () => clearTimeout(timer);
		  }, [api, liveJob, load]);
		  (0, import_react.useEffect)(() => {
		    if (api === null || running || record === void 0 || recordKey === "") return;
		    if (framesKey.current === recordKey) return;
		    framesKey.current = recordKey;
		    void (async () => {
		      try {
		        const result = await api.storyboard({
		          path: record.sceneFile,
		          scene: record.scene,
		          quality: record.quality,
		          count: 6,
		          width: 480
		        });
		        if (framesKey.current === recordKey) setFrames(result.frames);
		      } catch (failure) {
		        if (framesKey.current === recordKey) {
		          framesKey.current = "";
		          setError(failure instanceof Error ? failure.message : String(failure));
		        }
		      }
		    })();
		  }, [api, record, recordKey, running]);
		  const startRender = (0, import_react.useCallback)(async () => {
		    if (api === null || entry === null || activeQuality === void 0) return;
		    if (sceneClass === null) {
		      setError(t("scene.multiple"));
		      return;
		    }
		    setBusy(true);
		    setError(null);
		    try {
		      const result = await api.render({ root, path: entry.path, scene: sceneClass, quality: activeQuality.id });
		      setJob(result.job);
		      setFrames([]);
		      framesKey.current = "";
		      refreshedFor.current = "";
		    } catch (failure) {
		      setError(failure instanceof Error ? failure.message : String(failure));
		    } finally {
		      setBusy(false);
		    }
		  }, [activeQuality, api, entry, root, sceneClass]);
		  const cancelRender = (0, import_react.useCallback)(async () => {
		    if (api === null || liveJob === null) return;
		    try {
		      await api.cancel({ id: liveJob.id });
		    } catch (failure) {
		      setError(failure instanceof Error ? failure.message : String(failure));
		    }
		  }, [api, liveJob]);
		  const makeStoryboard = (0, import_react.useCallback)(async () => {
		    if (api === null || entry === null || activeQuality === void 0) return;
		    setBusy(true);
		    try {
		      const result = liveJob !== null && liveJob.state === "done" ? await api.storyboard({ id: liveJob.id, count: 6, width: 480 }) : await api.storyboard({
		        path: entry.path,
		        scene: sceneClass ?? void 0,
		        quality: activeQuality.id,
		        count: 6,
		        width: 480
		      });
		      setFrames(result.frames);
		      framesKey.current = recordKey;
		      setError(null);
		    } catch (failure) {
		      setError(failure instanceof Error ? failure.message : String(failure));
		    } finally {
		      setBusy(false);
		    }
		  }, [activeQuality, api, entry, liveJob, recordKey, sceneClass]);
		  const newScene = (0, import_react.useCallback)(async () => {
		    if (api === null) return;
		    const name2 = window.prompt(t("scene.newPrompt"), "Explainer");
		    if (name2 === null || name2.trim() === "") return;
		    setBusy(true);
		    try {
		      const created = await api.template({ root, name: name2.trim() });
		      await load(true);
		      setSelected(created.path);
		      setSceneClass(created.scene);
		      setError(null);
		    } catch (failure) {
		      setError(failure instanceof Error ? failure.message : String(failure));
		    } finally {
		      setBusy(false);
		    }
		  }, [api, load, root]);
		  const changeQuality = (0, import_react.useCallback)((id) => {
		    setQuality(id);
		    setFrames([]);
		  }, []);
		  const seek = (0, import_react.useCallback)((time) => {
		    const video = videoRef.current;
		    if (video === null) return;
		    video.currentTime = time;
		    void video.play();
		  }, []);
		  if (root === "") {
		    const candidates = roots ?? [];
		    if (candidates.length > 1) {
		      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: cx("rootPicker"), children: [
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: cx("rootPickerTitle"), children: t("panel.pickRoot") }),
		        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: cx("rootPickerHint"), children: t("panel.pickRootHint") }),
		        candidates.map((candidate2) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
		          "button",
		          {
		            type: "button",
		            className: cx("rootItem"),
		            onClick: () => {
		              chosenRoot = candidate2.path;
		              rememberPick(session.id, candidate2.path);
		              setPicked(candidate2.path);
		            },
		            children: [
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("rootItemName"), children: candidate2.name }),
		              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cx("rootItemPath"), children: candidate2.path })
		            ]
		          },
		          candidate2.path
		        ))
		      ] });
		    }
		    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: cx("notice"), children: t("panel.noRoot") });
		  }
		  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
		    StudioView,
		    {
		      data,
		      selected,
		      sceneClass,
		      quality,
		      job,
		      frames,
		      error,
		      busy,
		      showLog,
		      onSelect: setSelected,
		      onSceneClass: setSceneClass,
		      onQuality: changeQuality,
		      onRender: () => void startRender(),
		      onCancel: () => void cancelRender(),
		      onRefresh: () => void load(true),
		      onStoryboard: () => void makeStoryboard(),
		      onNewScene: () => void newScene(),
		      onToggleLog: () => setShowLog((value) => !value),
		      frameUrl: (file) => api?.frameUrl(file) ?? "",
		      videoUrl,
		      onSeek: seek,
		      videoRef,
		      videoFile,
		      onSelectVideo: (rel) => setVideoFile(rel),
		      runtimeHint,
		      onSetupRuntime: () => void setupRuntime(),
		      setupProgress
		    }
		  );
		}

		// src/client/panel-icon.tsx
		var import_jsx_runtime3 = require("react/jsx-runtime");
		var CHROME_VIEWBOX = "0 0 24 24";
		var COLOR_VIEWBOX = "0 0 28 28";
		var STUDIO_VIOLET = "#8b5cf6";
		function ChromePaths() {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M5 3.4h14a2.4 2.4 0 0 1 2.4 2.4v12.4a2.4 2.4 0 0 1-2.4 2.4H5a2.4 2.4 0 0 1-2.4-2.4V5.8A2.4 2.4 0 0 1 5 3.4Z" }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M10.1 9.3 15.6 12.6 10.1 15.9Z", strokeWidth: "2.2", strokeLinejoin: "round" })
		  ] });
		}
		function ColorPaths() {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("g", { fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M9.6 4.2h11.2a3.4 3.4 0 0 1 3.4 3.4v2.2" }) }),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		      "path",
		      {
		        d: "M5.6 6.6h16.8a3.2 3.2 0 0 1 3.2 3.2v8.6a3.2 3.2 0 0 1-3.2 3.2H5.6a3.2 3.2 0 0 1-3.2-3.2v-8.6a3.2 3.2 0 0 1 3.2-3.2Z",
		        fill: "currentColor"
		      }
		    ),
		    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("g", { color: "var(--dsw-static-neutral-00)", "data-dsh-manim-mark": "", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M11.4 9.9 18 14l-6.6 4.1Z", fill: "currentColor", stroke: "currentColor", strokeWidth: "1.6", strokeLinejoin: "round" }) })
		  ] });
		}
		function StudioGlyph({
		  size = 16,
		  variant = "chrome",
		  className
		}) {
		  const merged = className ?? "";
		  const color = variant === "color";
		  const base = color ? studio_default.studioMark : studio_default.railMark;
		  const classes = merged === "" ? base : `${merged} ${base}`;
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
		    "svg",
		    {
		      viewBox: color ? COLOR_VIEWBOX : CHROME_VIEWBOX,
		      width: size,
		      height: size,
		      className: classes,
		      fill: "none",
		      ...color ? {} : { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
		      xmlns: "http://www.w3.org/2000/svg",
		      "aria-hidden": "true",
		      focusable: "false",
		      "data-dsh-manim-glyph": "",
		      "data-dsh-manim-variant": variant,
		      children: color ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ColorPaths, {}) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ChromePaths, {})
		    }
		  );
		}
		function StudioMark({ size = 26, className }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { display: "contents", "--dsh-file-type-icon-color": STUDIO_VIOLET }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(StudioGlyph, { size, variant: "color", className }) });
		}
		function StudioRailGlyph({ size = 16 }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(StudioGlyph, { size, variant: "chrome" });
		}

		// src/client/tab-title.tsx
		var import_jsx_runtime4 = require("react/jsx-runtime");
		function StudioTabTitle({ useTabInfo }) {
		  const { tab } = useTabInfo();
		  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
		    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(StudioMark, { size: 16, className: studio_default.titleIcon }),
		    tab.title
		  ] });
		}

		// src/client/error-boundary.tsx
		var import_react2 = require("react");
		var import_jsx_runtime5 = require("react/jsx-runtime");
		function report(where, message, stack) {
		  try {
		    void fetch("/dsh-manim/client-log", {
		      method: "POST",
		      headers: { "content-type": "application/json" },
		      body: JSON.stringify({ where, message, stack })
		    }).catch(() => {
		    });
		  } catch {
		  }
		}
		var PanelBoundary = class extends import_react2.Component {
		  state = { message: "", stack: "" };
		  static getDerivedStateFromError(error) {
		    const message = error instanceof Error ? error.message : String(error);
		    const stack = error instanceof Error ? error.stack ?? "" : "";
		    return { message, stack };
		  }
		  componentDidCatch(error, info) {
		    const message = `${error.message}
		${info.componentStack ?? ""}`.trim();
		    console.error("[dsh-manim] panel crashed:", message);
		    report(this.props.where, error.message, `${error.stack ?? ""}
		${info.componentStack ?? ""}`);
		  }
		  render() {
		    if (this.state.message === "") return this.props.children;
		    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: studio_default.notice, children: [
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { children: `\u9762\u677F\u6E32\u67D3\u51FA\u9519\uFF1A${this.state.message}` }),
		      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: studio_default.small, children: this.props.where })
		    ] });
		  }
		};
		function useMountReport(where) {
		  (0, import_react2.useEffect)(() => {
		    const substituted = MISSING_ICONS.length === 0 ? "" : `substituted icons: ${MISSING_ICONS.join(", ")}`;
		    report(where, substituted === "" ? "panel body mounted" : `panel body mounted; ${substituted}`, "");
		  }, [where]);
		}

		// src/client/panel-row.tsx
		var import_jsx_runtime6 = require("react/jsx-runtime");
		function StudioPane({ makeApi: makeApi2, sessions }) {
		  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
		    "div",
		    {
		      "data-dsh-manim-pane-host": "",
		      style: {
		        display: "flex",
		        flexDirection: "column",
		        flex: "auto",
		        height: "100%",
		        minHeight: "0",
		        minWidth: "0",
		        overflow: "hidden"
		      },
		      children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Studio, { makeApi: makeApi2, sessions })
		    }
		  );
		}
		function makePanelIcon(open) {
		  return function ManimPanelIcon({ size = 16 }) {
		    const host = (0, import_react3.useRef)(null);
		    (0, import_react3.useEffect)(() => {
		      const row = host.current?.closest("button");
		      if (row === null || row === void 0) return;
		      const onClick = (event) => {
		        event.stopPropagation();
		        open();
		      };
		      row.addEventListener("click", onClick);
		      return () => {
		        row.removeEventListener("click", onClick);
		      };
		    }, [open]);
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { ref: host, style: { display: "contents" }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(StudioRailGlyph, { size }) });
		  };
		}
		function registerManimStudio(ctx, seats) {
		  const { makeApi: makeApi2, id, kind, locale } = seats;
		  ctx.effect(() => ctx.sidebarRightTabs.register({
		    id,
		    kind,
		    priority: "extension",
		    title: () => t("tab.label"),
		    // 开始 (the guide page) lists one capsule per registered type; without this
		    // entry the studio simply does not exist there. The capsule wears the right
		    // sidebar's dialect — the colour variant at the family's 26px — while the
		    // rail row above wears the monochrome one.
		    guide: [{
		      order: 40,
		      title: () => t("guide.title"),
		      description: () => t("guide.description"),
		      icon: ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(StudioMark, { size: 26, className })
		    }]
		  }), "dsh-manim: tab type");
		  const openStudio = () => {
		    try {
		      ctx.sidebarRight.openTab(kind);
		    } catch (error) {
		      console.error("[dsh-manim] openTab failed:", error);
		    }
		  };
		  let sessions;
		  try {
		    sessions = ctx.sessions.list;
		  } catch {
		    sessions = void 0;
		  }
		  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
		    name: "sidebar.right.pane.tab",
		    key: id,
		    locale
		  }, function ManimPane() {
		    useMountReport("\u52A8\u753B\u5DE5\u4F5C\u5BA4");
		    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(PanelBoundary, { where: "\u52A8\u753B\u5DE5\u4F5C\u5BA4", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(StudioPane, { makeApi: makeApi2, sessions }) });
		  })), "dsh-manim: \u52A8\u753B\u5DE5\u4F5C\u5BA4 tab body");
		  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
		    name: "sidebar.right.pane.tab.title",
		    key: id
		  }, StudioTabTitle)), "dsh-manim: \u52A8\u753B\u5DE5\u4F5C\u5BA4 tab title");
		  if (seats.sidebarEntry === true) {
		    ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
		      name: "sidebar.panellist",
		      id,
		      order: 25,
		      label: () => t("entry.label"),
		      locale
		    }, makePanelIcon(openStudio))), "dsh-manim: sidebar row");
		  }
		}

		// src/client/video-preview.tsx
		var import_react4 = require("react");
		var import_jsx_runtime7 = require("react/jsx-runtime");
		var VIDEO_EXTENSIONS = ["mp4", "m4v", "webm", "mov", "ogv"];
		var VIDEO_PREVIEW_ID = "dsh-manim-video";
		var MIME = {
		  mp4: "video/mp4",
		  m4v: "video/mp4",
		  webm: "video/webm",
		  mov: "video/quicktime",
		  ogv: "video/ogg"
		};
		function suffixOf(address) {
		  const clean = address.split("?")[0]?.split("#")[0] ?? "";
		  const dot = clean.lastIndexOf(".");
		  return dot === -1 ? "" : clean.slice(dot + 1).toLowerCase();
		}
		function VideoBody(props) {
		  const { content, resourceAddress = "" } = props;
		  const [url, setUrl] = (0, import_react4.useState)("");
		  (0, import_react4.useEffect)(() => {
		    if (content?.kind !== "bytes" || content.data === void 0) {
		      setUrl("");
		      return;
		    }
		    const type = MIME[suffixOf(resourceAddress)] ?? "video/mp4";
		    const next = URL.createObjectURL(new Blob([content.data], { type }));
		    setUrl(next);
		    return () => URL.revokeObjectURL(next);
		  }, [content, resourceAddress]);
		  if (url === "") return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: studio_default.notice, children: t("video.loading") });
		  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: studio_default.documentVideoWrap, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("video", { className: studio_default.documentVideo, src: url, controls: true, playsInline: true, preload: "metadata" }) });
		}
		function registerVideoPreview(ctx) {
		  const runtime = ctx;
		  if (typeof runtime.inject !== "function") return;
		  try {
		    runtime.inject(["documentPreviews"], (scope) => {
		      try {
		        registerOn(scope);
		      } catch (error) {
		        console.error("[dsh-manim] video preview registration failed:", error);
		      }
		    });
		  } catch (error) {
		    console.error("[dsh-manim] video preview injection failed:", error);
		  }
		}
		function registerOn(scope) {
		  const previews = scope.documentPreviews;
		  if (previews === void 0 || typeof previews.register !== "function") return;
		  previews.register({
		    id: VIDEO_PREVIEW_ID,
		    extensions: VIDEO_EXTENSIONS,
		    priority: "extension",
		    loading: "bytes-complete",
		    wrap: false,
		    title: () => t("video.title")
		  });
		  const slots = scope.slots;
		  const effect = scope.effect;
		  if (slots === void 0 || typeof slots.inject !== "function" || typeof slots.register !== "function") return;
		  const register = slots.register;
		  effect?.(
		    () => slots.inject?.call(slots, "sidebar.right.tab.document", () => register.call(slots, {
		      name: "sidebar.right.tab.document",
		      key: VIDEO_PREVIEW_ID,
		      locale: "manim"
		    }, function ManimVideoBody(owner) {
		      return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(VideoBody, { ...owner });
		    })),
		    "dsh-manim: video preview body"
		  );
		  console.info("[dsh-manim] video preview registered");
		}

		// src/client/index.ts
		var NS = "manim";
		var name = "dsh-manim";
		var inject = ["slots", "locale", "sessions", "sidebarRight", "sidebarRightTabs"];
		var MANIM_ID = "dsh-manim";
		var MANIM_KIND = "manim";
		function makeApi(root) {
		  return new StudioApi(root);
		}
		async function apply(ctx) {
		  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), "dsh-manim: dictionaries");
		  let sidebarEntry = false;
		  try {
		    const raw = ctx.config;
		    sidebarEntry = raw?.sidebarEntry === true;
		  } catch {
		    sidebarEntry = false;
		  }
		  registerManimStudio(ctx, { makeApi, id: MANIM_ID, kind: MANIM_KIND, locale: NS, sidebarEntry });
		  let sessionStore;
		  try {
		    sessionStore = ctx.sessions?.list;
		  } catch {
		    sessionStore = void 0;
		  }
		  try {
		    registerWorkspaceDetection(ctx, sessionStore);
		  } catch (error) {
		    console.warn("[dsh-manim] workspace detection skipped:", error);
		  }
		  try {
		    registerVideoPreview(ctx);
		  } catch (error) {
		    console.warn("[dsh-manim] video preview skipped:", error);
		  }
		}
		return module.exports;
	}
});
