// lib/paths.mjs — 配置与路径。所有模块只从这里拿路径，避免到处拼字符串。
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = {
  patentsRoot: "./patents",
  workRoot: "./work",
  outRoot: "./out",
  skillRoot: "./skills/anatomy",
  chrome: null,
  docSections: ["一句话结论","它要解决的问题","结构与几何","原理","制备","数据","权利要求布局","证据边界","假设与简化","定位与自由实施","数值与标号出处"],
  audit: {
    requireDisclaimerForModelNumbers: true,
    disclaimerMarkers: ["读数说明", "画法说明", "模型", "示意值", "本图取", "非专利", "换算"],
    corruptionWhitelist: [],
  },
  outputs: {
    atlas: "专利结构动态演算图鉴.html",
    station: "专利解剖台.html",
    report: "专利深度解析.md",
  },
};

export function loadConfig() {
  const p = join(ROOT, "patent-anatomy.config.json");
  let cfg = {};
  if (existsSync(p)) {
    try { cfg = JSON.parse(readFileSync(p, "utf8")); } catch (e) {
      throw new Error(`配置文件解析失败：${p}\n${e.message}`);
    }
  }
  const merged = {
    ...DEFAULTS,
    ...cfg,
    audit: { ...DEFAULTS.audit, ...(cfg.audit || {}) },
    outputs: { ...DEFAULTS.outputs, ...(cfg.outputs || {}) },
  };
  // 环境变量可覆盖输入目录（便于直接指向现成的专利库）
  if (process.env.PATENTS_ROOT) merged.patentsRoot = process.env.PATENTS_ROOT;
  merged.patentsRoot = resolve(ROOT, merged.patentsRoot);
  merged.workRoot = resolve(ROOT, merged.workRoot);
  merged.outRoot = resolve(ROOT, merged.outRoot);
  merged.skillRoot = resolve(ROOT, merged.skillRoot);
  return merged;
}

export const cfg = loadConfig();

export const skillPath = (...parts) => join(cfg.skillRoot, ...parts);
export const workDir = (id) => join(cfg.workRoot, id);
export const outDir = (id) => join(cfg.outRoot, id);
export const workFile = (id, name) => join(workDir(id), name);

/** kit 的绝对 file:// URL —— 生成脚本 import 时用 */
export const kitUrl = () => pathToFileURL(skillPath("kit", "iso-kit.mjs")).href;
export const inlineKitUrl = () => pathToFileURL(skillPath("scripts", "inline-kit.mjs")).href;
