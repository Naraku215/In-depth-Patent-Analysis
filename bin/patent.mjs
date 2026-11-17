#!/usr/bin/env node
// bin/patent.mjs — 专利解析 agent 的 CLI
//
// 原则：
//   · 一次只解析一件专利（不做批量）
//   · 校验是生成阶段的门禁，不产出审计文件
//   · 交付只有 out/<id>/index.html 一个入口
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, cfg, workDir, skillPath } from "../lib/paths.mjs";
import { ensureDir, patentId, read, write, writeJson, readJson, listDirs, ok, fail, warn, info, table } from "../lib/util.mjs";
import { parseCorpus } from "../lib/corpus.mjs";
import { auditPatent, formatAudit, paragraphsFromMd, paragraphsFromMjs } from "../lib/audit.mjs";
import { mdToHtml } from "../lib/md2html.mjs";
import { bundleSite } from "../lib/bundle.mjs";
import { verifyAll } from "../lib/verify.mjs";
import { checkStationSemantics } from "../lib/semantics.mjs";
import { packageOutputs } from "../lib/package.mjs";
import { node, run } from "../lib/run.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.find((a) => !a.startsWith("--"));

/* ---------------------------------------------------------------- 发现 */

function scanPatents() {
  const root = cfg.patentsRoot;
  if (!existsSync(root)) return { error: `输入目录不存在：${root}` };
  const found = [];
  for (const d of listDirs(root)) {
    const dir = join(root, d);
    const md = join(dir, "full.md");
    const hasImages = existsSync(join(dir, "images"));
    if (!existsSync(md) && !hasImages) continue;
    if (!existsSync(md)) {
      // 有 images/ 没 full.md：目录建了但文件没放全
      found.push({ id: patentId(d), dir, dirName: d, md, images: true, incomplete: true });
      continue;
    }
    found.push({ id: patentId(d), dir, dirName: d, md, images: hasImages, incomplete: !hasImages });
  }
  // 散落在 patents/ 根目录下的文件：系统不认，但要告诉用户
  const stray = [];
  if (existsSync(join(root, "full.md"))) stray.push("full.md");
  if (existsSync(join(root, "images"))) stray.push("images/");
  return { patents: found, stray };
}

/** 一次只解析一件：指定了就取指定；没指定且只有一件就取它；否则报错 */
function pickTarget(spec) {
  const { patents, error, stray } = scanPatents();
  if (error) throw new Error(error);
  if (spec === "all") throw new Error("本系统一次只解析一件专利，不支持批量。请指定一个 id。");
  if (spec) {
    const hit = patents.find((p) => p.id === spec || p.dirName === spec);
    if (!hit) throw new Error(`找不到专利「${spec}」。可用：${patents.map((p) => p.id).join(", ") || "(空)"}`);
    return hit;
  }
  if (patents.length === 0) {
    let msg = `patents/ 里没有可解析的专利（每件要一个文件夹，里面放 full.md 与 images/）：${cfg.patentsRoot}`;
    if (stray.length) msg += `\n注意：patents/ 根目录下有 ${stray.join("、")} 散落着，系统不会解析——请放进一个子文件夹，例如 patents/某专利/full.md`;
    throw new Error(msg);
  }
  if (patents.length > 1) {
    throw new Error(`patents/ 里有 ${patents.length} 件专利，请指定要解析哪一件：\n  ` + patents.map((p) => `${p.id}　(${p.dirName})`).join("\n  "));
  }
  return patents[0];
}

const stateFile = (id) => join(workDir(id), "state.json");
const getState = (id) => readJson(stateFile(id), { id, stages: {} });
const setStage = (id, k, v) => {
  const s = getState(id);
  s.stages = { ...(s.stages || {}), [k]: v };
  s.updatedAt = new Date().toISOString();
  writeJson(stateFile(id), s);
  return s;
};

/* ---------------------------------------------------------------- 内部校验 */

function collectBlocks(id) {
  const wd = workDir(id);
  const blocks = [];
  const push = (source, arr) => { for (const t of arr) blocks.push({ source, text: t }); };
  const doc = join(wd, "doc.md");
  if (existsSync(doc)) push("doc", paragraphsFromMd(read(doc)));
  const buildDir = join(wd, "build");
  if (existsSync(buildDir)) {
    for (const f of readdirSync(buildDir)) {
      if (f.endsWith(".mjs")) push(`figure:${f}`, paragraphsFromMjs(read(join(buildDir, f))));
    }
  }
  const jsDir = join(wd, "station", "js");
  for (const f of ["scenes.js", "report.js"]) {
    if (existsSync(join(jsDir, f))) push(`station:${f}`, paragraphsFromMjs(read(join(jsDir, f))));
  }
  return blocks;
}

function collectRawSources(id) {
  const wd = workDir(id);
  const out = [];
  const add = (source, fp) => { if (existsSync(fp)) out.push({ source, text: read(fp) }); };
  add("doc", join(wd, "doc.md"));
  const buildDir = join(wd, "build");
  if (existsSync(buildDir)) for (const f of readdirSync(buildDir)) if (f.endsWith(".mjs")) add("figure:" + f, join(buildDir, f));
  const jsDir = join(wd, "station", "js");
  for (const f of ["scenes.js", "report.js"]) add("station:" + f, join(jsDir, f));
  return out;
}

/** 跑一遍全部规矩，返回结果；只写内部文件 .check.json，不进交付 */
function runCheck(spec) {
  const p = pickTarget(spec);
  const wd = workDir(p.id);
  const facts = readJson(join(wd, "facts.json"));
  if (!facts) throw new Error("尚未抽取，先运行：patent extract");
  const corpus = { ...facts, rawText: read(p.md) };

  const artifacts = {};
  for (const key of ["station", "atlas", "report"]) {
    // 文档以 doc.md 为准（它是源，改完就该立刻被校验到），没有才退回构建产物
    const fp = key === "report"
      ? (existsSync(join(wd, "doc.md")) ? join(wd, "doc.md") : join(wd, cfg.outputs.report))
      : join(wd, cfg.outputs[key]);
    if (existsSync(fp)) artifacts[key] = { path: fp, dir: dirname(fp), text: read(fp) };
  }
  const result = auditPatent({
    id: p.id,
    corpus,
    artifacts,
    blocks: collectBlocks(p.id),
    rawSources: collectRawSources(p.id),
  });
  writeJson(join(wd, ".check.json"), result);
  setStage(p.id, "checked", { at: new Date().toISOString(), score: result.score, ok: result.ok });
  return result;
}

/* ---------------------------------------------------------------- 命令 */

function cmdDoctor() {
  const rows = [];
  const major = Number(process.version.slice(1).split(".")[0]);
  rows.push({ 项: "node", 值: process.version, 状态: major >= 20 ? "ok" : "FAIL" });
  rows.push({ 项: "仓库", 值: ROOT, 状态: existsSync(join(ROOT, "package.json")) ? "ok" : "FAIL" });
  rows.push({ 项: "输入目录", 值: cfg.patentsRoot, 状态: existsSync(cfg.patentsRoot) ? "ok" : "缺失" });
  const need = ["kit/iso-kit.mjs", "scripts/inline-kit.mjs", "scripts/capture.mjs", "scripts/chrome-port.mjs", "scripts/lines.mjs", "scripts/drive.mjs", "scripts/line-ends.mjs", "SKILL.md", "LICENSE"];
  const missing = need.filter((f) => !existsSync(skillPath(...f.split("/"))));
  rows.push({ 项: "anatomy 副本", 值: missing.length ? "缺 " + missing.join(", ") : `${need.length} 个文件齐`, 状态: missing.length ? "缺失" : "ok" });
  const { patents, error, stray } = scanPatents();
  const usable = error ? [] : patents.filter((p) => !p.incomplete);
  rows.push({ 项: "待解析", 值: error ? "—" : `${usable.length} 件`, 状态: error ? "检查输入目录" : usable.length ? "ok" : "空" });
  console.log(table(rows, ["项", "值", "状态"]));
  if (!error && stray.length) warn(`patents/ 根目录下有 ${stray.join("、")} 散落着——每件专利要放进一个子文件夹`);
  if (!error && patents.some((p) => p.incomplete)) warn("有目录缺 full.md 或 images/");
  if (!error && usable.length > 1) info(`共 ${usable.length} 件。解析时指定 id，一次一件。`);
  return error ? 1 : 0;
}

function cmdList() {
  const { patents, error, stray } = scanPatents();
  if (error) return fail(error);
  if (!patents.length) {
    fail(`patents/ 里没有可解析的专利。${cfg.patentsRoot}`);
    console.log("\n每件专利要一个文件夹，里面放两样：");
    console.log("  patents/你的专利名/full.md");
    console.log("  patents/你的专利名/images/");
    if (stray.length) {
      console.log(`\n注意：patents/ 根目录下有 ${stray.join("、")} 散落着，系统不解析。`);
      console.log("请放进一个子文件夹，例如：patents/你的专利名/full.md");
    }
    return 1;
  }
  console.log(table(patents.map((p) => {
    const s = getState(p.id).stages || {};
    return {
      id: p.id,
      目录: p.dirName,
      原文: p.incomplete ? "缺文件" : "✓",
      images: p.images ? "✓" : "缺",
      抽取: s.extracted ? "✓" : "·",
      产出: s.built ? "✓" : "·",
      交付: s.packaged ? "✓" : "·",
    };
  }), ["id", "目录", "原文", "images", "抽取", "产出", "交付"]));
  const bad = patents.filter((p) => p.incomplete);
  if (bad.length) warn(`${bad.length} 件缺 full.md 或 images/，先补齐再解析`);
  if (stray.length) warn(`patents/ 根目录下有 ${stray.join("、")} 散落着，未计入——要放进子文件夹`);
  if (patents.length > 1) info(`共 ${patents.length} 件。解析时指定 id：node bin/patent.mjs extract <id>`);
  return 0;
}

function cmdInit(spec) {
  const p = pickTarget(spec);
  const wd = ensureDir(workDir(p.id));
  const site = join(wd, "station");
  if (!existsSync(site)) copyDir(join(ROOT, "templates", "station"), site);

  const build = ensureDir(join(wd, "build"));
  if (!existsSync(join(build, "shared.mjs"))) copyFileSync(join(ROOT, "templates", "figure", "shared.mjs"), join(build, "shared.mjs"));
  if (!existsSync(join(build, "fig-01.mjs"))) copyFileSync(join(ROOT, "templates", "figure", "fig-template.mjs"), join(build, "fig-01.mjs"));
  if (!existsSync(join(build, "atlas.mjs"))) copyFileSync(join(ROOT, "templates", "figure", "atlas.mjs"), join(build, "atlas.mjs"));

  const skillUrl = pathToFileURL(cfg.skillRoot).href;
  for (const f of readdirSync(build)) {
    if (!f.endsWith(".mjs")) continue;
    const fp = join(build, f);
    const src = read(fp);
    if (src.includes("__SKILL__")) write(fp, src.split("__SKILL__").join(skillUrl));
  }

  const doc = join(wd, "doc.md");
  if (!existsSync(doc)) copyFileSync(join(ROOT, "templates", "doc", "skeleton.md"), doc);

  writeJson(stateFile(p.id), {
    ...getState(p.id), id: p.id, dir: p.dir, dirName: p.dirName, md: p.md, images: p.images,
    createdAt: new Date().toISOString(), stages: { initialized: true },
  });
  ok(`初始化 ${p.id} → ${wd}`);
  info("下一步：读 facts → 写 build/fig-*.mjs、station/js/scenes.js、doc.md");
  return 0;
}

function cmdExtract(spec) {
  const p = pickTarget(spec);
  ensureDir(workDir(p.id));
  let facts = parseCorpus(read(p.md), { id: p.id });
  const overridesPath = join(workDir(p.id), "facts.overrides.json");
  if (existsSync(overridesPath)) {
    const ov = readJson(overridesPath, {}) || {};
    for (const key of ["title", "patentNo", "assignee", "figures", "numerals", "referenceSigns", "figureSigns", "extractionCorrections"]) {
      if (ov[key] !== undefined) facts[key] = ov[key];
    }
    if (Array.isArray(ov.numbersAppend)) {
      const seen = new Set(facts.numbers.map((n) => n.raw + "|" + n.unit + "|" + JSON.stringify(n.value)));
      for (const n of ov.numbersAppend) {
        const key = n.raw + "|" + n.unit + "|" + JSON.stringify(n.value);
        if (!seen.has(key)) { facts.numbers.push(n); seen.add(key); }
      }
    }
    if (Array.isArray(ov.warningsAppend)) facts.warnings.push(...ov.warningsAppend);
    facts.warnings.push("已应用 facts.overrides.json 人工校正");
  }

  // 附图文件清单：把 images/ 里的图挂到 facts 上，让 agent 知道要逐张打开哪几张
  facts.images = [];
  const imgDir = join(p.dir, "images");
  if (existsSync(imgDir)) {
    const figOf = new Map();
    for (const f of facts.figures || []) for (const src of f.images || []) figOf.set(src.replace(/^images\//, ""), f.n);
    for (const name of readdirSync(imgDir)) {
      if (!/\.(png|jpe?g|webp|gif|tif?f|bmp)$/i.test(name)) continue;
      let bytes = 0;
      try { bytes = statSync(join(imgDir, name)).size; } catch {}
      facts.images.push({ file: `images/${name}`, fig: figOf.get(name) || null, bytes });
    }
    if (!facts.images.length) facts.warnings.push("images/ 目录是空的：图鉴与解剖台只能依据文字");
  } else {
    facts.warnings.push("没有 images/ 目录：图鉴与解剖台只能依据文字");
  }
  if (!facts.paragraphs.length) {
    facts.warnings.push("原文没有 [00xx] 段号：文档引用请改用权项号与章节名（Background / Detailed Description）");
  }

  writeJson(join(workDir(p.id), "facts.json"), facts);
  setStage(p.id, "extracted", { at: new Date().toISOString(), chars: facts.stats.chars });
  ok(`${p.id}：段落 ${facts.paragraphs.length} · 权项 ${facts.claims.length} · 标号 ${facts.numerals.length} · 候选 ${facts.referenceSigns.length} · 附图 ${facts.figures.length} · 图片 ${facts.images.length} · 数字 ${facts.numbers.length}`);
  for (const w of facts.warnings) warn("  " + w);
  if (facts.images.length) info(`  图片：${facts.images.map((i) => i.file.split("/").pop()).join(", ")}`);
  return 0;
}

function cmdFacts(spec) {
  const p = pickTarget(spec);
  const f = readJson(join(workDir(p.id), "facts.json"));
  if (!f) return fail("尚未抽取，先运行：patent extract");
  console.log(`标题：${f.title}`);
  console.log(`语种：${f.languages.join(" / ")}　字数：${f.stats.chars}`);
  console.log(`段落 ${f.paragraphs.length}　权项 ${f.claims.length}　标号 ${f.numerals.length}　附图 ${f.figures.length}　图片 ${(f.images || []).length}`);
  console.log("\n权利要求（前 3 条）：");
  for (const c of f.claims.slice(0, 3)) console.log(`  ${c.n}. ${c.text.slice(0, 150)}${c.text.length > 150 ? "…" : ""}`);
  console.log("\n标号表（前 20 个）：");
  for (const n of f.numerals.slice(0, 20)) console.log(`  ${n.num.padEnd(4)} ${n.label.slice(0, 56)}`);

  if ((f.images || []).length) {
    console.log("\n附图文件（逐张打开看，图里有文字没写的东西）：");
    for (const im of f.images) {
      console.log(`  ${(im.fig || "—").padEnd(6)} ${im.file.replace(/^images\//, "")}  ${(im.bytes / 1024).toFixed(0)} KB`);
    }
    console.log(`  → 打开目录：${p.dir}/images/`);
  } else {
    console.log("\n注意：没有找到附图文件，图鉴与解剖台只能依据文字——细节密度会明显下降。");
  }
  return 0;
}

async function cmdBuild(spec) {
  const p = pickTarget(spec);
  const wd = workDir(p.id);
  if (!existsSync(wd)) return fail(`未初始化：${wd}\n先运行：patent init`);
  const facts = readJson(join(wd, "facts.json")) || {};

  /* 1) 图鉴 */
  const buildDir = join(wd, "build");
  if (existsSync(buildDir)) {
    // 仓库搬家后，工作区里写死的 skill 绝对路径会失效：每次 build 前校正一次
    const skillUrl = pathToFileURL(cfg.skillRoot).href;
    for (const f of readdirSync(buildDir)) {
      if (!f.endsWith(".mjs")) continue;
      const fp = join(buildDir, f);
      const src = read(fp);
      let fixed = src.replace(/__SKILL__/g, skillUrl);
      fixed = fixed.replace(/file:\/\/[^"\s]*?\/skills\/anatomy/g, skillUrl);
      if (fixed !== src) write(fp, fixed);
    }
    for (const s of readdirSync(buildDir).filter((f) => f.endsWith(".mjs") && f.startsWith("fig-"))) {
      const r = await node([join(buildDir, s)], { cwd: buildDir });
      if (r.code !== 0) warn(`图脚本失败 ${s}：\n${(r.err || r.out).slice(0, 800)}`);
      else info(`${s} ✓`);
    }
    const atlas = join(buildDir, "atlas.mjs");
    if (existsSync(atlas)) {
      const target = join(wd, cfg.outputs.atlas);
      const before = existsSync(target) ? statSync(target).mtimeMs : 0;
      const r = await node([atlas, "--light"], { cwd: buildDir });
      if (r.code !== 0) warn(`图册编页失败：\n${(r.err || r.out).slice(0, 800)}`);
      for (const cand of [join(buildDir, cfg.outputs.atlas)]) {
        if (existsSync(cand) && cand !== target) copyFileSync(cand, target);
      }
      const after = existsSync(target) ? statSync(target).mtimeMs : 0;
      if (after > before) info(`图鉴 → ${cfg.outputs.atlas}`);
      else warn("图鉴没有被更新（检查 atlas.mjs 的输出路径）");
    }
  }

  /* 2) 解剖台 */
  const site = join(wd, "station");
  if (existsSync(join(site, "index.html"))) {
    const title = (facts.title || p.dirName).replace(/"/g, "&quot;");
    const ip = join(site, "index.html");
    write(ip, read(ip).replace(/\{\{TITLE\}\}/g, title).replace(/\{\{SUBTITLE\}\}/g, facts.title || ""));
    const sc = join(site, "js", "scenes.js");
    if (existsSync(sc)) {
      const j = (v, d) => String(v || d).replace(/[\r\n"]/g, " ").slice(0, 60);
      write(sc, read(sc)
        .replace(/\{\{PATENT_NO\}\}/g, j(facts.patentNo, p.dirName))
        .replace(/\{\{SHORT_TITLE\}\}/g, j(facts.title, "—"))
        .replace(/\{\{ASSIGNEE\}\}/g, j(facts.assignee, "—"))
        .replace(/\{\{TYPE\}\}/g, "—"));
    }
    const r = bundleSite(site, join(wd, cfg.outputs.station));
    info(`解剖台 ${(r.bytes / 1024).toFixed(0)} KB`);
    if (r.leftOver) warn("打包后仍有未内联的外链，检查 index.html");
  }

  /* 3) 文档 */
  const doc = join(wd, "doc.md");
  if (existsSync(doc)) {
    write(join(wd, cfg.outputs.report), read(doc));
    write(join(wd, cfg.outputs.report.replace(/\.md$/, ".html")), mdToHtml(read(doc), { title: facts.title || "专利深度解析" }));
    info(`文档 → ${cfg.outputs.report}`);
  }

  setStage(p.id, "built", { at: new Date().toISOString() });

  /* 4) 出文件前先过规矩 */
  const c = runCheck(p.id);
  if (c.ok) ok(`构建完成，内部校验通过（${c.score}/100）`);
  else {
    warn(`构建完成，但校验未过（${c.score}/100）：`);
    for (const e of c.errors.slice(0, 6)) console.log(`   [${e.code}] ${e.msg}`);
    info("完整清单：node bin/patent.mjs check");
  }
  return 0;
}

async function cmdVerify(spec) {
  const p = pickTarget(spec);
  const wd = workDir(p.id);
  const tmp = ensureDir(join(wd, ".verify"));
  const stationHtml = join(wd, cfg.outputs.station);
  const atlasHtml = join(wd, cfg.outputs.atlas);
  if (!existsSync(stationHtml) && !existsSync(atlasHtml)) return fail("还没有构建产物，先运行 build");
  const r = await verifyAll({
    stationHtml: existsSync(stationHtml) ? stationHtml : null,
    atlasHtml: existsSync(atlasHtml) ? atlasHtml : null,
    tmpDir: tmp,
  });
  const rows = [];
  for (const [k, v] of Object.entries(r.files)) rows.push({ 项: `文件 ${k}`, 结果: v ? "ok" : "缺失" });
  for (const [k, v] of Object.entries(r.lines)) rows.push({ 项: `悬空线端 ${k}`, 结果: v.ok === null ? "跳过" : v.ok ? "0" : `FAIL ${v.ends}` });
  for (const [k, v] of Object.entries(r.render)) rows.push({ 项: `渲染 ${k}`, 结果: v.ok === null ? "跳过" : v.ok ? "clean" : v.chromeMissing ? "无法启动 Chrome" : "FAIL" });
  if (r.semantics?.station) {
    const s = r.semantics.station;
    rows.push({ 项: "语义 station", 结果: s.ok === null ? "跳过" : s.ok ? "ok" : `FAIL ${(s.errors || []).length}` });
  }
  console.log(table(rows, ["项", "结果"]));
  writeJson(join(wd, ".verify.json"), r);
  return rows.some((x) => String(x.结果).startsWith("FAIL")) ? 3 : 0;
}

async function makeThumb(srcHtml, outPng, { width = 640, height = 420, wait = 2400 } = {}) {
  const script = skillPath("scripts", "capture.mjs");
  if (!existsSync(script)) return null;
  const r = await node([script, srcHtml, "--out", outPng, "--width", String(width), "--height", String(height), "--wait", String(wait)]);
  return r.code === 0 && existsSync(outPng) ? outPng : null;
}

async function cmdPackage(spec) {
  const p = pickTarget(spec);
  const wd = workDir(p.id);
  const facts = readJson(join(wd, "facts.json")) || {};

  // 固定两件：解剖台 + 文档。图鉴按专利决定，可以没有。
  for (const [label, file] of [["解剖台", cfg.outputs.station], ["文档", cfg.outputs.report]]) {
    if (!existsSync(join(wd, file))) {
      return fail(`没有${label}产出（${file}）。这两件是固定要有的，先补上再 build。`);
    }
  }
  if (!existsSync(join(wd, cfg.outputs.atlas))) {
    info("没出图鉴 —— 这件专利没有可画的实体结构，按两件交付。");
  }

  const c = runCheck(p.id);
  if (!c.ok) {
    console.log(formatAudit(c));
    return fail(`内部校验未通过（${c.score}/100），先修再交付：node bin/patent.mjs check`);
  }

  const stationPre = join(wd, cfg.outputs.station);
  if (existsSync(stationPre)) {
    const sem = await checkStationSemantics(stationPre, ensureDir(join(wd, ".verify")));
    if (sem.ok === false) {
      const first = (sem.errors || []).slice(0, 4).map((e) => `${e.label || e.view}: 图上缺 ${(e.missingInLabels || []).join(",") || "-"}；表缺 ${(e.missingInTable || []).join(",") || "-"}`).join(" | ");
      return fail(`语义校验未通过：图上标号与右栏标号表不一致。${first}`);
    }
    if (sem.ok === null) warn(`语义校验跳过：${sem.skipped || ""}`);
  }

  const thumbDir = ensureDir(join(wd, ".thumbs"));
  const station = join(wd, cfg.outputs.station);
  const atlas = join(wd, cfg.outputs.atlas);
  const report = join(wd, cfg.outputs.report.replace(/\.md$/, ".html"));

  info("生成缩略图…");
  const tStation = existsSync(station) ? await makeThumb(station, join(thumbDir, "station.png"), { width: 720, height: 460 }) : null;
  const tAtlas = existsSync(atlas) ? await makeThumb(atlas, join(thumbDir, "atlas.png"), { width: 720, height: 460 }) : null;
  const tReport = existsSync(report) ? await makeThumb(report, join(thumbDir, "report.png"), { width: 720, height: 460 }) : null;

  const parts = [
    { kind: "station", file: "01-station.html", src: station, thumb: tStation },
    { kind: "atlas", file: "02-atlas.html", src: atlas, thumb: tAtlas },
    { kind: "report", file: "03-report.html", src: report, thumb: tReport },
  ];
  const { dir, parts: built } = packageOutputs({
    id: p.id,
    title: facts.title || p.dirName,
    meta: {
      patentNo: facts.patentNo || p.dirName,
      footnote: "数字与标号均可回溯到专利原文",
      builtAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    },
    parts,
  });
  const mdSrc = join(wd, cfg.outputs.report);
  if (existsSync(mdSrc)) copyFileSync(mdSrc, join(dir, "03-report.md"));

  setStage(p.id, "packaged", { at: new Date().toISOString() });
  ok(`交付目录 → ${dir}`);
  info(`打开：${join(dir, "index.html")}`);
  for (const f of built) info(`  ${f}`);
  return 0;
}

function cmdStatus() {
  const { patents, error } = scanPatents();
  if (error) return fail(error);
  if (!patents.length) return fail("没有专利");
  console.log(table(patents.map((p) => {
    const s = getState(p.id).stages || {};
    return {
      id: p.id, 目录: p.dirName,
      抽取: s.extracted ? "✓" : "·", 产出: s.built ? "✓" : "·",
      校验: s.checked ? `${s.checked.score}` : "·", 交付: s.packaged ? "✓" : "·",
    };
  }), ["id", "目录", "抽取", "产出", "校验", "交付"]));
  return 0;
}

function cmdPrompts(stage) {
  const dir = join(ROOT, "prompts");
  if (!stage) { for (const f of readdirSync(dir).sort()) info(f); return 0; }
  const hit = readdirSync(dir).find((f) => f.startsWith(stage) || f.includes(stage));
  if (!hit) return fail(`没有该阶段提示词：${stage}`);
  console.log(read(join(dir, hit)));
  return 0;
}

/* ---------------------------------------------------------------- 帮助 */

const HELP = `
专利解析 agent

  node bin/patent.mjs doctor          环境自检
  node bin/patent.mjs list            列出输入目录里的专利
  node bin/patent.mjs init   [id]     铺工作区与模板
  node bin/patent.mjs extract [id]    full.md → facts.json（段落/权项/标号/附图/数字）
  node bin/patent.mjs facts  [id]     看抽取结果
  node bin/patent.mjs build  [id]     跑图脚本、打包解剖台、渲染文档，并做一次内部校验
  node bin/patent.mjs check  [id]     内部校验（数字/标号/权项/段号/占位符/损坏）
  node bin/patent.mjs verify [id]     悬空线端 + headless 渲染
  node bin/patent.mjs package [id]    校验通过后出 index.html
  node bin/patent.mjs status          进度
  node bin/patent.mjs prompts [阶段]   阶段提示词

  一次只解析一件专利。输入目录只有一件时 id 可省略。
  输入：${cfg.patentsRoot}
  产出：${cfg.outRoot}/<id>/index.html
`;

/* ---------------------------------------------------------------- 分发 */

function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, f.name), d = join(dst, f.name);
    if (f.isDirectory()) copyDir(s, d); else copyFileSync(s, d);
  }
}

const main = async () => {
  try {
    switch (cmd) {
      case "doctor": return cmdDoctor();
      case "list": return cmdList();
      case "init": return cmdInit(arg);
      case "extract": return cmdExtract(arg);
      case "facts": return cmdFacts(arg);
      case "build": return await cmdBuild(arg);
      case "check":
      case "audit": {
        const c = runCheck(arg);
        console.log(formatAudit(c));
        return c.ok ? 0 : 2;
      }
      case "verify": return await cmdVerify(arg);
      case "package": return await cmdPackage(arg);
      case "status": return cmdStatus();
      case "prompts": return cmdPrompts(arg);
      default: console.log(HELP); return cmd ? 1 : 0;
    }
  } catch (e) {
    return fail(e.message);
  }
};

process.exit(await main());
