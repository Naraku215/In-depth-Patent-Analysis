// lib/verify.mjs — 把 anatomy skill 的验收脚本接进来，做"这张图真的对吗"的机器检查。
// 硬指标：line ends: 0、console: clean、图上标号与右栏标号表一致。
import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { cfg, skillPath } from "./paths.mjs";
import { node } from "./run.mjs";
import { checkStationSemantics } from "./semantics.mjs";

export async function checkLines(htmlPath, outPng) {
  const script = skillPath("scripts", "lines.mjs");
  if (!existsSync(script)) return { ok: null, skipped: "未找到 skill/scripts/lines.mjs" };
  const r = await node([script, htmlPath, "--out", outPng], { cwd: cfg.skillRoot });
  const m = /line ends:\s*(\d+)/.exec(r.out + r.err);
  const ends = m ? Number(m[1]) : null;
  return { ok: ends === 0, ends, console: /console:\s*clean/.test(r.out + r.err), log: (r.out + r.err).slice(-600) };
}

export async function checkRender(htmlPath, outPng, { width = 900, height = 1000, select = null, wait = 2500 } = {}) {
  const script = skillPath("scripts", "capture.mjs");
  if (!existsSync(script)) return { ok: null, skipped: "未找到 skill/scripts/capture.mjs" };
  const args = [script, htmlPath, "--out", outPng, "--width", String(width), "--height", String(height), "--wait", String(wait)];
  if (select) args.push("--select", select);
  const r = await node(args, { cwd: cfg.skillRoot });
  const blob = r.out + r.err;
  const consoleClean = /console:\s*clean/.test(blob);
  const saved = /saved\s+(\S+)/.test(blob);
  const chromeMissing = /Could not find|chrome|Chromium|ENOENT/i.test(blob) && !saved;
  return { ok: saved && consoleClean, saved, consoleClean, chromeMissing, log: blob.slice(-800) };
}

export function fileOk(p, min = 1024) {
  return existsSync(p) && statSync(p).size >= min;
}

export async function verifyAll({ stationHtml, atlasHtml, tmpDir }) {
  const out = { lines: {}, render: {}, files: {}, semantics: {} };
  out.files.station = fileOk(stationHtml, 40 * 1024);
  out.files.atlas = fileOk(atlasHtml, 20 * 1024);
  if (stationHtml) out.lines.station = await checkLines(stationHtml, join(tmpDir, "lines-station.png"));
  if (atlasHtml) out.lines.atlas = await checkLines(atlasHtml, join(tmpDir, "lines-atlas.png"));
  if (stationHtml) out.render.station = await checkRender(stationHtml, join(tmpDir, "render-station.png"), { width: 1440, height: 900 });
  if (atlasHtml) out.render.atlas = await checkRender(atlasHtml, join(tmpDir, "render-atlas.png"), { width: 900, height: 1000 });
  if (stationHtml) out.semantics.station = await checkStationSemantics(stationHtml, tmpDir);
  return out;
}
