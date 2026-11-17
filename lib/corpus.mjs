// lib/corpus.mjs — 把 full.md 解析成结构化事实。这是整个系统的"地面真值"。
// 所有下游产物（图、解剖台、文档）最终都要能被这里的字段验证。
import { normalizeText } from "./util.mjs";
import { extractNumbers } from "./numbers.mjs";

const CLAIM_HEADING = /^#{0,6}\s*(what is claimed(?: is)?|claims?|we claim|patentanspr(ü|ue)che|权利要求书|权利要求)\s*[:：]?\s*$/i;
const NUMERAL_HEADING = /(reference signs?( list)?|reference numerals?|bezugszeichenliste|附图标记|附图标记说明|标号|标号说明|部件标号)/i;
const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const PARA_NO = /^\s*\[(\d{3,4})\]\s*/;
const FIG_RE_SRC = "(?:fig(?:ure)?\\.?\\s*|图\\s*)(\\d{1,2}[a-z]?)";

/** 把全角/异体符号归一，便于跨语种检索（含 LaTeX 还原） */
export function fold(s) {
  return deLatex(normalizeText(String(s)))
    .replace(/[\uff10-\uff19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48))
    .replace(/[\uff21-\uff3a\uff41-\uff5a]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\uff0c]/g, ",")
    .replace(/[\uff05]/g, "%")
    .replace(/[\uff0e]/g, ".");
}

/**
 * 拆 LaTeX：MinerU/PaddleOCR 抽出来的全文常把单位写成 $500\mu \mathrm{m}$。
 * 不还原成 µm，文档里写「500 µm」就对不上原文。
 */
export function deLatex(s) {
  let t = String(s);
  t = t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)");
  t = t.replace(/\\(?:mathrm|text|textrm|mathbf|operatorname)\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\circ\b/g, "°");
  t = t.replace(/\\mu\b/g, "µ");
  t = t.replace(/\\times/g, "×").replace(/\\sim/g, "~").replace(/\\%/g, "%");
  t = t.replace(/\\[,;:!]/g, " ");
  t = t.replace(/\\(?:left|right|big|Big)\b/g, "");
  t = t.replace(/\^\{\s*([^{}]*?)\s*\}/g, "^$1");
  t = t.replace(/\^°/g, "°");
  t = t.replace(/°\s*C/g, "°C");
  t = t.replace(/_\{([^{}]*)\}/g, "_$1");
  t = t.replace(/\$/g, "");
  t = t.replace(/°\s*C/g, "°C");
  return t;
}

function lastFigure(text, index, span = 1400) {
  const before = text.slice(Math.max(0, index - span), index);
  const matches = [...before.matchAll(new RegExp(FIG_RE_SRC, "gi"))];
  return matches.length ? matches[matches.length - 1][1] : null;
}

/**
 * 图片后的图注优先；只在图后没有图注时才回看图前。
 * 这样同时支持“图片在上/图注在下”和“图注在上/图片在下”两种排法。
 */
function figureNearImage(text, imageIndex, imageEnd) {
  const afterAll = text.slice(imageEnd, imageEnd + 360);
  const nextImg = afterAll.search(/!\[[^\]]*\]\(images\//);
  const after = nextImg >= 0 ? afterAll.slice(0, nextImg) : afterAll;
  const am = new RegExp(FIG_RE_SRC, "i").exec(after);
  if (am) return { n: am[1], side: "after", distance: am.index };

  const before = text.slice(Math.max(0, imageIndex - 180), imageIndex);
  const bm = [...before.matchAll(new RegExp(FIG_RE_SRC, "gi"))].pop();
  if (bm) return { n: bm[1], side: "before", distance: before.length - bm.index };
  return null;
}

const STOP_WORDS = new Set(["about","approximately","around","from","to","of","the","a","an","at","in","on","with","and","or","is","are","was","were","this","that","these","those","such","as","for","by","same","said","between","under","above","below","over","less","more","than","about"]);
const PART_NOUN = /chamber|torch|nozzle|inlet|outlet|reactor|wall|pipe|tube|valve|port|pump|separator|trap|gas|stream|plasma|electrode|line|flow|system|engine|source|supply|nozzle|lance|vessel|conduit|passage|opening/i;

const LEADING_WORDS = new Set(["a","an","the","said","at","in","on","with","and","or","from","to","of","by","is","are","was","were","about","approximately","around"]);
const TRAILING_WORDS = new Set(["of","to","by","about","approximately","around","and","or"]);

function normalizePartPhrase(label) {
  let words = label.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
  while (words.length && LEADING_WORDS.has(words[0])) words.shift();
  while (words.length && TRAILING_WORDS.has(words[words.length - 1])) words.pop();
  if (!words.length || words.length > 4) return null;
  if (words.some((w) => STOP_WORDS.has(w))) return null;
  if (words.some((w) => /^(fig|figure|claim|example|embodiment|table|line|column|paragraph|patent|document|filed|date|rightarrow)$/i.test(w))) return null;
  if (words.length === 1 && words[0].length < 4) return null;
  return words.join(" ");
}

/**
 * 解析 full.md
 * @returns 结构化事实
 */
export function parseCorpus(md, { id = null } = {}) {
  const text = deLatex(normalizeText(md));
  const lines = text.split("\n");

  const out = {
    id,
    stats: {
      chars: text.length,
      lines: lines.length,
      words: (text.match(/[A-Za-z\u4e00-\u9fa5]+/g) || []).length,
    },
    title: null,
    headings: [],
    paragraphs: [],
    claims: [],
    numeralList: [],
    numerals: [],
    referenceSigns: [],
    figureSigns: {},
    figures: [],
    numbers: [],
    languages: [],
    warnings: [],
  };

  /* ---------- 标题 ---------- */
  for (const line of lines) {
    const m = /^#\s+(.+)$/.exec(line);
    if (m) { out.title = m[1].trim(); break; }
  }
  if (!out.title) {
    const first = lines.find((l) => l.trim().length > 8);
    if (first) out.title = first.trim().slice(0, 120);
  }

  /* ---------- 元信息（尽力而为，取不到就留空） ---------- */
  const head = text.slice(0, 4000);
  out.patentNo =
    (/(?:公开号|公告号|专利号|Publication\s*(?:No\.?|Number)|Pub\.?\s*No\.?)\s*[:：]?\s*([A-Z]{2}[\s\d,/.]{5,24}[A-Z0-9])/i.exec(head) || [])[1] ||
    (/\b(US|EP|DE|CN|WO)\s?[\d,]{6,}[A-Z]\d?\b/.exec(head) || [])[0] ||
    null;
  out.assignee =
    (/(?:申请人|专利权人|Assignee|Applicant|Anmelder)\s*[:：]\s*([^\n]{2,80})/i.exec(head) || [])[1]?.trim() ||
    null;
  if (out.patentNo) out.patentNo = out.patentNo.replace(/\s+/g, " ").trim();

  /* ---------- 标题层级 ---------- */
  lines.forEach((line, i) => {
    const m = HEADING.exec(line);
    if (m) out.headings.push({ level: m[1].length, text: m[2], line: i + 1 });
  });

  /* ---------- 段落（带 [00xx] 编号） ---------- */
  let cur = null;
  lines.forEach((line, i) => {
    const p = PARA_NO.exec(line);
    if (p) {
      if (cur) out.paragraphs.push(cur);
      cur = { no: p[1], line: i + 1, text: line.replace(PARA_NO, "").trim() };
    } else if (cur && line.trim() && !HEADING.test(line)) {
      cur.text += " " + line.trim();
    } else if (cur && HEADING.test(line)) {
      out.paragraphs.push(cur); cur = null;
    }
  });
  if (cur) out.paragraphs.push(cur);

  /* ---------- 权利要求 ---------- */
  let claimStart = -1;
  let claimEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (CLAIM_HEADING.test(lines[i].trim())) { claimStart = i; break; }
  }
  if (claimStart >= 0) {
    let curClaim = null;
    for (let i = claimStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (NUMERAL_HEADING.test(line) && line.length < 120) { claimEnd = i; break; }
      if (/^\s*(\*{3,}|-{3,})\s*$/.test(line)) { claimEnd = i; break; }
      const m = /^\s*(\d{1,3})\.\s+(.*)$/.exec(line);
      if (m) {
        if (curClaim) out.claims.push(curClaim);
        curClaim = { n: Number(m[1]), text: m[2].trim(), line: i + 1 };
      } else if (curClaim && line.trim()) {
        curClaim.text += " " + line.trim();
      }
    }
    if (curClaim) out.claims.push(curClaim);
    if (out.claims.length && out.claims[0].n !== 1) {
      out.warnings.push("权利要求编号未从 1 开始，已全部保留，请人工确认起点");
    }
  } else {
    out.warnings.push("未识别到权利要求书章节（标题可能不是 What is claimed / Patentansprüche / 权利要求）");
  }

  /* ---------- 标号清单 ---------- */
  let numStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (NUMERAL_HEADING.test(lines[i]) && lines[i].length < 160) { numStart = i; break; }
  }
  if (numStart >= 0) {
    for (let i = numStart + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { if (out.numeralList.length) break; else continue; }
      if (HEADING.test(line)) break;
      const m = /^([0-9]{1,3}[a-z]?['′]?)[\.\)]?\s+(.{2,})$/.exec(line);
      if (m) {
        out.numeralList.push({ num: m[1], label: m[2].trim(), line: i + 1 });
      } else if (out.numeralList.length && !/^[0-9]/.test(line)) {
        out.numeralList[out.numeralList.length - 1].label += " " + line;
      } else if (out.numeralList.length) {
        break;
      }
    }
  }

  /* ---------- 标号集合（清单 + 正文内联提及 + 名词后缀） ---------- */
  const set = new Map();
  for (const it of out.numeralList) set.set(it.num, it.label);

  const inline = /(?:numerals?|reference (?:sign|numeral)s?|bezugszeichen|ziffer|标号|编号)\s*[（(]?\s*((?:\d{1,3}[a-z]?)(?:\s*(?:and|,|、|&)\s*\d{1,3}[a-z]?)*)/gi;
  let m;
  while ((m = inline.exec(text))) {
    for (const token of (m[1].match(/\d{1,3}[a-z]?/gi) || [])) {
      if (!set.has(token)) set.set(token, "(正文内联提及)");
    }
  }

  // 美国专利常见写法：a plasma torch 21 / reactor chamber 20。
  // 这里只产生候选并保留图号；候选不会覆盖清单或显式内联标号。
  const candidateCounts = new Map();
  const nounNum = /\b([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,2})\s+(\d{1,3}[a-z]?)(?![0-9]|[.,]\d)\b/g;
  while ((m = nounNum.exec(text))) {
    const label = normalizePartPhrase(m[1]);
    const num = m[2];
    if (!label) continue;
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    const lineEnd = text.indexOf("\n", m.index);
    const lineText = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
    const lineFig = new RegExp(FIG_RE_SRC, "i").exec(lineText);
    const fig = lineFig ? lineFig[1] : lastFigure(text, m.index);
    const line = text.slice(0, m.index).split("\n").length;
    const context = text.slice(Math.max(0, m.index - 70), Math.min(text.length, m.index + 120)).replace(/\s+/g, " ").trim();
    out.referenceSigns.push({ fig, num, label, line, context, source: "noun+numeral" });
    const key = fig ? `${fig}:${num}` : num;
    if (!candidateCounts.has(key)) candidateCounts.set(key, new Map());
    const byLabel = candidateCounts.get(key);
    byLabel.set(label, (byLabel.get(label) || 0) + 1);
  }

  const candidatePrimary = new Map();
  for (const [key, byLabel] of candidateCounts) {
    const num = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
    const best = [...byLabel.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best) continue;
    const total = [...byLabel.values()].reduce((a, b) => a + b, 0);
    if (total >= 2 && PART_NOUN.test(best[0])) {
      if (!candidatePrimary.has(num) || candidatePrimary.get(num).count < total) {
        candidatePrimary.set(num, { label: best[0], count: total, fig: key.includes(":") ? key.slice(0, key.indexOf(":")) : null });
      }
    }
  }
  for (const [num, c] of candidatePrimary) {
    if (!set.has(num) || set.get(num) === "(正文内联提及)") set.set(num, c.label);
  }

  out.numerals = [...set.entries()].map(([num, label]) => {
    const primary = candidatePrimary.get(num);
    return { num, label, ...(primary ? { fig: primary.fig, confidence: primary.count >= 2 ? "medium" : "candidate" } : {}) };
  });

  /* ---------- 附图 ---------- */
  const figMap = new Map();
  const imgRe = /!\[[^\]]*\]\((images\/[^)]+)\)/g;
  let im;
  while ((im = imgRe.exec(text))) {
    const near = figureNearImage(text, im.index, im.index + im[0].length);
    const key = near ? near.n : `img${figMap.size + 1}`;
    if (!figMap.has(key)) figMap.set(key, { n: key, images: [], side: near?.side || "none" });
    figMap.get(key).images.push(im[1]);
  }
  out.figures = [...figMap.values()];

  /* ---------- 数字 ---------- */
  const claimTextStart = claimStart >= 0 ? lines.slice(0, claimStart + 1).join("\n").length : -1;
  const claimTextEnd = claimStart >= 0 ? lines.slice(0, claimEnd).join("\n").length : -1;
  out.numbers = extractNumbers(text).map((n) => ({
    ...n,
    inClaims: claimStart >= 0 && n.index >= claimTextStart && n.index < claimTextEnd,
  }));

  /* ---------- 图号作用域 ---------- */
  for (const s of out.referenceSigns) {
    if (!s.fig) continue;
    if (!out.figureSigns[s.fig]) out.figureSigns[s.fig] = [];
    out.figureSigns[s.fig].push(s);
  }
  for (const f of out.figures) {
    if (out.figureSigns[f.n]) f.numerals = out.figureSigns[f.n];
  }

  /* ---------- 语种 ---------- */
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (cjk > latin * 0.3) out.languages.push("zh");
  if (/\b(der|die|das|und|wobei)\b/i.test(text)) out.languages.push("de");
  if (/\b(the|and|wherein|said)\b/i.test(text)) out.languages.push("en");

  if (!out.claims.length) out.warnings.push("权利要求为空，深度解析将缺少权项依据");
  if (!out.numerals.length) out.warnings.push("未识别到部件标号，解剖台提示词应要求从正文自建标号表");
  if (!out.figures.length) out.warnings.push("未识别到附图引用，图鉴将只能依据文字");

  return out;
}

/** 供审计用：文本中是否出现过某个数字字面量（折叠后比对） */
export function hasNumberLiteral(text, literal) {
  const t = fold(text);
  const l = fold(literal);
  const esc = l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  return new RegExp(`(?<![0-9.])${esc}(?![0-9])`).test(t);
}

/** 找某段引文在原文中的位置（用于"结论必须能指回原文"） */
export function findQuote(text, quote, minLen = 12) {
  const t = fold(text).replace(/\s+/g, "");
  const q = fold(quote).replace(/\s+/g, "");
  if (q.length < minLen) return { found: false, reason: "过短" };
  const i = t.indexOf(q);
  return i >= 0 ? { found: true, index: i } : { found: false };
}
