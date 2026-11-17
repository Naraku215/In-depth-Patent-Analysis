// lib/audit.mjs — 事实审计引擎。
// 目标：把"专利原文"与"三件产出"之间的每一个可核事实对齐，无法对齐的必须被显式标注。
// 上一轮人工审计发现的 14 类问题，全部在这里变成可复跑的检查项。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fold, hasNumberLiteral } from "./corpus.mjs";
import { salientNumbers, literalSet, canon } from "./numbers.mjs";
import { cfg } from "./paths.mjs";

const SEV = { ERROR: "error", WARN: "warn", INFO: "info" };

/* ---------------- 文本切分 ---------------- */

export function paragraphsFromMd(md) {
  const blocks = [];
  const lines = md.split("\n");
  let buf = [];
  let inFence = false;
  const flush = () => { if (buf.length) { blocks.push(buf.join("\n")); buf = []; } };
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; flush(); blocks.push("```fence```"); continue; }
    if (inFence) continue;
    if (!line.trim()) { flush(); continue; }
    if (/^#{1,6}\s/.test(line)) { flush(); blocks.push(line); continue; }
    if (/^\s*\|/.test(line)) { flush(); blocks.push(line); continue; }
    if (/^\s*[-*]\s|^\s*\d+\.\s/.test(line)) { buf.push(line.trim()); continue; }
    buf.push(line.trim());
  }
  flush();
  return blocks.filter((b) => b && b !== "```fence```");
}

export function paragraphsFromHtml(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const blocks = body
    .split(/<\/?(?:p|div|li|tr|h[1-6]|section|header|footer|figcaption|td|th|blockquote)[^>]*>/i)
    .map((s) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return blocks;
}

/** 从生成脚本里抽取"用户会看到的字符串"（中文串或含单位的串） */
export function paragraphsFromMjs(src) {
  const blocks = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const s = m[2];
    if (!/[\u4e00-\u9fa5]/.test(s) && !/\d+\s*(mm|μm|µm|℃|bar|%|kHz|kPa)/.test(s)) continue;
    if (s.length < 4) continue;
    // 跳过 URL、文件路径、百分号编码（模板里的 skill 路径会带 %93%88 这类串）
    if (/[a-z]+:\/\//i.test(s) || /%[0-9A-F]{2}/i.test(s) || /[\\/][\w.-]+[\\/][\w.-]+/.test(s)) continue;
    // 跳过画图代码里的 SVG 片段：那是几何，不是对专利的陈述
    if (/<\s*(svg|path|rect|circle|text|g)\b/i.test(s) || /viewBox|preserveAspectRatio/.test(s)) continue;
    blocks.push(s.replace(/\\n/g, "\n"));
  }
  return blocks;
}

/* ---------------- 检查项 ---------------- */

function checkArtifacts(artifacts) {
  const rows = [];
  for (const [k, a] of Object.entries(artifacts)) {
    if (!a) { rows.push({ name: k, status: "缺失", detail: "未生成" }); continue; }
    const size = a.text.length;
    rows.push({
      name: k,
      status: size > 1200 ? "存在" : "过小",
      detail: `${(size / 1024).toFixed(0)} KB`,
    });
  }
  return rows;
}

function isYearLike(n) {
  if (n.unit) return false;
  const v = String(Array.isArray(n.value) ? n.value[0] : n.value);
  return /^\d{4}$/.test(v.replace(/\./g, "")) && Number(v) > 1900 && Number(v) < 2100;
}
function isTrivial(n) {
  if (n.unit) return false;
  if (Array.isArray(n.value)) return false;
  const v = String(n.value);
  return !/\./.test(v) && v.length <= 2; // 1~2 位无单位的整数（序号、个数）
}

/**
 * 数字溯源：产出里的数字能不能在专利原文里找到。
 * 找不到的，必须在同一段落里出现免责标注，否则报错。
 */
function checkNumbers({ corpus, blocks, markers }) {
  const literals = literalSet(corpus.numbers);
  const corpusText = corpus.rawText || "";
  const errors = [];
  const labeled = [];
  const traced = [];

  for (const { source, text } of blocks) {
    const nums = salientNumbers(text);
    for (const n of nums) {
      if (isYearLike(n) || isTrivial(n)) continue;
      const key = canon(Array.isArray(n.value) ? n.value[0] : n.value, n.unit);
      const keyRange = Array.isArray(n.value) ? `${canon(n.value[0], n.unit)}~${canon(n.value[1], n.unit)}` : null;

      let hit = literals.has(key) || literals.has(keyRange || "") || hasNumberLiteral(corpusText, n.raw);
      if (!hit && Array.isArray(n.value)) {
        hit = hasNumberLiteral(corpusText, n.value[0]) && hasNumberLiteral(corpusText, n.value[1]);
      }

      if (hit) { traced.push({ source, value: n.raw }); continue; }

      const hasMarker = markers.some((mk) => text.includes(mk));
      if (hasMarker) labeled.push({ source, value: n.raw });
      else errors.push({ source, value: n.raw, text: text.slice(0, 160) });
    }
  }
  return { traced, labeled, errors };
}

/** 标号溯源：产出的部件表里每个标号必须在专利原文里出现 */
function checkNumerals({ corpus, artifacts, rawSources }) {
  const known = new Set(corpus.numerals.map((x) => x.num));
  const corpusText = fold(corpus.rawText || "");
  const errors = [];
  const ok = [];
  for (const { source, text } of (rawSources && rawSources.length ? rawSources : artifacts)) {
    // ['12', '说明'] 或 | `12` | 说明 | 或 正文里的「标号 12」
    const pats = [
      /\[\s*['"`]([0-9]{1,3}[a-z]?['′]?)['"`]\s*,\s*['"`]/g,
      /\|\s*`([0-9]{1,3}[a-z]?['′]?)`\s*\|/g,
      /^\s*[-*]\s*\**([0-9]{1,3}[a-z]?)\**\s*[:：]/gm,
      /(?:标号|编号|numeral|reference\s*(?:sign|numeral)|bezugszeichen|ziffer)\s*[（(]?\s*([0-9]{1,3}[a-z]?)/gi,
    ];
    for (const re of pats) {
      let m;
      while ((m = re.exec(text))) {
        const num = m[1].replace(/['′]/g, "");
        if (known.has(num) || hasNumeralToken(corpusText, num)) ok.push({ source, num });
        else errors.push({ source, num, hint: "专利原文未出现该标号" });
      }
    }
  }
  return { ok, errors };
}

function hasNumeralToken(text, num) {
  const esc = num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![0-9])${esc}(?![0-9])`).test(text);
}

/** 权项号：产出里引用的"权项 N"必须真实存在 */
function checkClaims({ corpus, texts }) {
  const max = corpus.claims.length ? Math.max(...corpus.claims.map((c) => c.n)) : 0;
  const errors = [];
  const ok = [];
  for (const { source, text } of texts) {
    const re = /(?:权项|权利要求|claim|anspruch)\s*([0-9]{1,3})/gi;
    let m;
    while ((m = re.exec(text))) {
      const n = Number(m[1]);
      if (!max) { errors.push({ source, claim: n, hint: "未解析到权利要求书" }); continue; }
      if (n >= 1 && n <= max) ok.push({ source, claim: n });
      else errors.push({ source, claim: n, hint: `超出权利要求总数 ${max}` });
    }
  }
  return { ok, errors, max };
}

/** 段落引用：[0013] 必须在原文存在 */
function checkParagraphRefs({ corpus, texts }) {
  const known = new Set(corpus.paragraphs.map((p) => p.no));
  const errors = [];
  const ok = [];
  for (const { source, text } of texts) {
    const re = /\[(\d{3,4})\]/g;
    let m;
    while ((m = re.exec(text))) {
      if (known.has(m[1])) ok.push({ source, no: m[1] });
      else errors.push({ source, no: m[1], hint: "原文无此段号" });
    }
  }
  return { ok, errors };
}

/** 未替换的模板占位符 */
function checkPlaceholders({ blocks }) {
  const hits = [];
  for (const { source, text } of blocks) {
    const m = /\{\{[^}]+\}\}/g;
    let x;
    while ((x = m.exec(text))) hits.push({ source, token: x[0] });
  }
  return hits;
}

/** 文字损坏：非白名单的重复汉字（上一轮真的踩过：填填/道道/利利/一一） */
function checkCorruption({ blocks, whitelist }) {
  const wl = new Set(whitelist);
  const hits = [];
  for (const { source, text } of blocks) {
    const re = /([\u4e00-\u9fa5])\1/g;
    let m;
    while ((m = re.exec(text))) {
      if (wl.has(m[0])) continue;
      hits.push({ source, dup: m[0], ctx: text.slice(Math.max(0, m.index - 12), m.index + 14) });
    }
  }
  return hits;
}

/** HTML 内部资源：相对链接必须存在 */
function checkLinks({ html, baseDir }) {
  const bad = [];
  const re = /(?:href|src)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (/^(#|https?:|mailto:|data:|javascript:)/.test(href)) continue;
    if (!existsSync(join(baseDir, decodeURIComponent(href)))) bad.push(href);
  }
  return bad;
}

/* ---------------- 主入口 ---------------- */

export function auditPatent({ id, corpus, artifacts, blocks, rawSources = [], metadata = {} }) {
  const markers = cfg.audit.disclaimerMarkers || [];
  const whitelist = cfg.audit.corruptionWhitelist || [];

  const result = {
    id,
    at: new Date().toISOString(),
    artifacts: checkArtifacts(artifacts),
    checks: {},
    errors: [],
    warnings: [],
    stats: {},
  };

  // 1 数字
  const nums = checkNumbers({ corpus, blocks, markers });
  result.checks.numbers = {
    traced: nums.traced.length,
    labeledAsModel: nums.labeled.length,
    untraced: nums.errors.length,
    untracedList: nums.errors.slice(0, 40),
    labeledList: nums.labeled.slice(0, 20),
  };
  if (nums.errors.length) {
    result.errors.push({
      code: "E-NUM-UNTRACED",
      msg: `${nums.errors.length} 个数字既不在专利原文中，也没有免责标注`,
      detail: nums.errors.slice(0, 8),
    });
  }

  // 2 标号
  const num = checkNumerals({ corpus, artifacts: blocks, rawSources });
  result.checks.numerals = { ok: num.ok.length, bad: num.errors.length, badList: num.errors.slice(0, 20) };
  if (num.errors.length) {
    result.errors.push({
      code: "E-NUMERAL-UNKNOWN",
      msg: `${num.errors.length} 处部件标号在专利原文中不存在`,
      detail: num.errors.slice(0, 8),
    });
  }

  // 2b 文档完整性：只查"该说的说了没"，不管怎么写（写法归模型判断）
  if (artifacts.report) {
    const md = artifacts.report.text;
    result.checks.doc = { chars: md.length };
    if (md.length < 1500) {
      result.warnings.push({ code: "W-DOC-THIN", msg: `文档只有 ${md.length} 字，可能没展开` });
    }
    if (!/证据边界|未证明|没有证明|局限/.test(md)) {
      result.warnings.push({ code: "W-DOC-EVIDENCE", msg: "没看到「证据边界」——专利没证明什么，是解读最该说清的一段" });
    }
    if (!/权项|权利要求|claim/i.test(md)) {
      result.warnings.push({ code: "W-DOC-CLAIMS", msg: "没讨论权利要求范围" });
    }
  }

  if (!corpus.numerals.length && (corpus.referenceSigns || []).length) {
    result.warnings.push({ code: "W-NUMERAL-CANDIDATES", msg: `有 ${corpus.referenceSigns.length} 条名词后缀标号候选，但尚未确认；请结合附图核对 facts.referenceSigns / facts.figureSigns` });
  }

  // 3 权项
  const cl = checkClaims({ corpus, texts: blocks });
  result.checks.claims = { max: cl.max, ok: cl.ok.length, bad: cl.errors.length, badList: cl.errors.slice(0, 10) };
  if (cl.errors.length) {
    result.errors.push({ code: "E-CLAIM", msg: `${cl.errors.length} 处权项引用超出范围`, detail: cl.errors.slice(0, 8) });
  }
  if (cl.max === 0) result.warnings.push({ code: "W-NO-CLAIMS", msg: "未解析到权利要求，文档中的权项引用无法校验" });

  // 4 段落引用（各局写法差异大：有的没有 [00xx]。只提醒，不阻断）
  const pr = checkParagraphRefs({ corpus, texts: blocks });
  result.checks.paragraphRefs = { ok: pr.ok.length, bad: pr.errors.length, badList: pr.errors.slice(0, 10) };
  if (pr.errors.length && corpus.paragraphs.length) {
    result.warnings.push({ code: "W-PARA-REF", msg: `${pr.errors.length} 处段号在原文中找不到`, detail: pr.errors.slice(0, 8) });
  }

  // 5 文字损坏
  const cor = checkCorruption({ blocks, whitelist });
  result.checks.corruption = { hits: cor.length, list: cor.slice(0, 20) };
  if (cor.length) {
    result.errors.push({
      code: "E-CORRUPTION",
      msg: `${cor.length} 处疑似重复汉字（批量替换留下的损坏）`,
      detail: cor.slice(0, 8),
    });
  }

  // 6 占位符
  const ph = checkPlaceholders({ blocks });
  result.checks.placeholders = { hits: ph.length, list: ph.slice(0, 20) };
  if (ph.length) {
    result.errors.push({ code: "E-PLACEHOLDER", msg: `${ph.length} 处模板占位符未替换`, detail: ph.slice(0, 8) });
  }

  // 7 链接
  for (const [name, a] of Object.entries(artifacts)) {
    if (!a || !/\.html$/i.test(a.path || "")) continue;
    const bad = checkLinks({ html: a.text, baseDir: a.dir || "." });
    result.checks[`links:${name}`] = { bad };
    if (bad.length) result.warnings.push({ code: "W-LINK", msg: `${name} 有 ${bad.length} 个失效链接`, detail: bad.slice(0, 8) });
  }

  result.stats = {
    corpusChars: corpus.stats.chars,
    paragraphs: corpus.paragraphs.length,
    claims: corpus.claims.length,
    numerals: corpus.numerals.length,
    referenceSigns: (corpus.referenceSigns || []).length,
    figures: corpus.figures.length,
    numbersInCorpus: corpus.numbers.length,
    blocksScanned: blocks.length,
  };
  result.ok = result.errors.length === 0;
  result.score = scoreOf(result);
  return result;
}

function scoreOf(r) {
  let s = 100;
  s -= r.errors.length * 12;
  s -= r.warnings.length * 3;
  return Math.max(0, Math.min(100, s));
}

export function formatAudit(r) {
  const L = [];
  L.push(`校验：${r.id}　评分 ${r.score} / 100　${r.ok ? "红线通过" : "有红线错误"}`);
  L.push("");
  L.push("产出：");
  for (const a of r.artifacts) L.push(`  ${a.status === "存在" ? "✓" : "✗"} ${a.name}　${a.detail}`);
  L.push("");
  const c = r.checks;
  L.push(`数字：可溯源 ${c.numbers.traced}　标注为模型 ${c.numbers.labeledAsModel}　无出处 ${c.numbers.untraced}`);
  L.push(`标号：可核 ${c.numerals.ok}　未知 ${c.numerals.bad}　候选 ${(r.stats.referenceSigns || 0)}`);
  L.push(`权项：总数 ${c.claims.max}　引用可核 ${c.claims.ok}　越界 ${c.claims.bad}`);
  L.push(`段号：可核 ${c.paragraphRefs.ok}　对不上 ${c.paragraphRefs.bad}`);
  L.push(`文字损坏：${c.corruption.hits}　占位符：${c.placeholders?.hits ?? 0}　文档 ${c.doc?.chars ?? 0} 字`);
  L.push("");
  if (r.errors.length) {
    L.push("红线（必须改，否则不交付）：");
    for (const e of r.errors) {
      L.push(`  [${e.code}] ${e.msg}`);
      for (const d of (e.detail || []).slice(0, 5)) L.push(`      · ${JSON.stringify(d)}`);
    }
    L.push("");
  }
  if (r.warnings.length) {
    L.push("建议（不影响交付，自己判断要不要改）：");
    for (const w of r.warnings) L.push(`  [${w.code}] ${w.msg}`);
  }
  return L.join("\n");
}

export { SEV };
