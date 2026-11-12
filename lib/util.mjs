// lib/util.mjs — 小工具。保持无依赖，node 20+ 直接跑。
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const UTF8 = new TextEncoder();
export const read = (p) => readFileSync(p, "utf8");
export const write = (p, s) => { mkdirSync(dirnameOf(p), { recursive: true }); writeFileSync(p, s); };
export const writeJson = (p, o) => write(p, JSON.stringify(o, null, 2) + "\n");
export function readJson(p, fallback = null) {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; }
}
export const exists = (p) => existsSync(p);
export const dirnameOf = (p) => p.replace(/[\\/][^\\/]+$/, "");
export const ensureDir = (p) => { mkdirSync(p, { recursive: true }); return p; };
export const listDirs = (p) =>
  existsSync(p) ? readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory()).sort() : [];
export const listFiles = (p) =>
  existsSync(p) ? readdirSync(p).filter((n) => statSync(join(p, n)).isFile()).sort() : [];

/** 从目录名推一个稳定的 id：保留 ASCII，中文转拼音不可靠，退化为哈希短码 */
export function patentId(dirName) {
  const ascii = dirName.replace(/[^A-Za-z0-9._-]+/g, "").replace(/^[._-]+/, "");
  if (ascii.length >= 3) return ascii.slice(0, 48);
  let h = 0;
  for (const ch of dirName) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return "patent-" + h.toString(36).slice(0, 6);
}

/** 统一换行、去零宽字符 */
export const normalizeText = (s) => s.replace(/\r\n?/g, "\n").replace(/[\u200b-\u200f\ufeff]/g, "");

export function fail(msg, code = 1) {
  console.error("\x1b[31m✗ " + msg + "\x1b[0m");
  process.exitCode = code;
  return code;
}
export function ok(msg) { console.log("\x1b[32m✓\x1b[0m " + msg); }
export function info(msg) { console.log("· " + msg); }
export function warn(msg) { console.log("\x1b[33m!\x1b[0m " + msg); }

export function table(rows, cols) {
  if (!rows.length) return "(空)";
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const pad = (s, n) => s + " ".repeat(Math.max(0, n - s.length));
  const head = cols.map((c, i) => pad(c, widths[i])).join("  ");
  const line = widths.map((w) => "-".repeat(w)).join("  ");
  return [head, line, ...rows.map((r) => cols.map((c, i) => pad(String(r[c] ?? ""), widths[i])).join("  "))].join("\n");
}
