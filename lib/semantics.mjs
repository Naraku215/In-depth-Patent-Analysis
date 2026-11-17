// lib/semantics.mjs — 检查“图上标号”和“右栏标号表”是不是同一套语义。
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cfg, skillPath } from "./paths.mjs";
import { node } from "./run.mjs";

function numeralsOf(strings) {
  const out = new Set();
  for (const s of strings || []) {
    for (const m of String(s).matchAll(/\b(\d{1,3}[a-z]?)\b/gi)) out.add(m[1]);
  }
  return out;
}

function overlapRatio(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const area = w * h;
  const minArea = Math.max(1, Math.min(a.w * a.h, b.w * b.h));
  return area / minArea;
}

export function analyzeStationSemantics(data) {
  const errors = [];
  const warnings = [];
  for (const v of data) {
    const labels = numeralsOf(v.labels);
    const parts = numeralsOf(v.parts);
    if (!labels.size && !parts.size) continue;
    const missingInLabels = [...parts].filter((n) => !labels.has(n));
    const missingInTable = [...labels].filter((n) => !parts.has(n));
    if (missingInLabels.length || missingInTable.length) {
      errors.push({ view: v.id, label: v.label, missingInLabels, missingInTable });
    }
    const vp = v.viewport || {};
    const out = (v.boxes || []).filter((b) => b.x < vp.x - 4 || b.y < vp.y - 4 || b.x + b.w > vp.x + vp.w + 4 || b.y + b.h > vp.y + vp.h + 4);
    if (out.length) warnings.push({ view: v.id, kind: "label-outside-viewport", count: out.length });
    const boxes = v.boxes || [];
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlapRatio(boxes[i], boxes[j]) > 0.28) overlaps++;
    if (overlaps) warnings.push({ view: v.id, kind: "label-overlap", count: overlaps });
  }
  return { ok: errors.length === 0, views: data.length, errors, warnings };
}

export async function checkStationSemantics(htmlPath, tmpDir) {
  const script = skillPath("scripts", "drive.mjs");
  if (!existsSync(script)) return { ok: null, skipped: "未找到 skill/scripts/drive.mjs" };
  if (!existsSync(htmlPath)) return { ok: null, skipped: "station HTML 不存在" };
  if (process.env.PATENT_SKIP_SEMANTICS === "1") return { ok: null, skipped: "PATENT_SKIP_SEMANTICS=1" };

  htmlPath = resolve(htmlPath);
  const actionsPath = resolve(tmpDir, "station-semantics-actions.json");
  const evalCode = `(async()=>{if(!window.__anatomyAudit||typeof window.__anatomyAudit.collect!=="function")return JSON.stringify({error:"missing __anatomyAudit"});return JSON.stringify(await window.__anatomyAudit.collect())})()`;
  writeFileSync(actionsPath, JSON.stringify([["eval", evalCode]]), "utf8");

  const r = await node([script, htmlPath, "--actions", actionsPath, "--width", "1440", "--height", "900"], { cwd: cfg.skillRoot });
  const blob = r.out + r.err;
  const line = blob.split(/\r?\n/).reverse().find((x) => x.startsWith("eval: "));
  let data;
  try {
    const value = JSON.parse(line.slice(6));
    data = typeof value === "string" ? JSON.parse(value) : value;
  } catch (e) {
    return { ok: null, skipped: "浏览器返回的语义检查结果无法解析", log: blob.slice(-1200) };
  }
  if (!Array.isArray(data)) {
    if (data?.error === "missing __anatomyAudit") return { ok: null, skipped: "station 未暴露 __anatomyAudit" };
    return { ok: false, error: data?.error || "语义检查返回格式异常", log: blob.slice(-800) };
  }

  return analyzeStationSemantics(data);
  return { ok: errors.length === 0, views: data.length, errors, warnings, log: blob.slice(-800) };
}




