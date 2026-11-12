// lib/corpus.mjs — 把 full.md 解析成结构化事实。这是整个系统的"地面真值"。
// 所有下游产物（图、解剖台、文档）最终都要能被这里的字段验证。
import { normalizeText } from "./util.mjs";
import { extractNumbers } from "./numbers.mjs";

const CLAIM_HEADING = /^#{0,6}\s*(what is claimed(?: is)?|claims?|we claim|patentanspr(ü|ue)che|权利要求书|权利要求)\s*[:：]?\s*$/i;
const NUMERAL_HEADING = /(reference signs?( list)?|reference numerals?|bezugszeichenliste|附图标记|附图标记说明|标号|标号说明|部件标号)/i;
const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const PARA_NO = /^\s*\[(\d{3,4})\]\s*/;

/** 把全角/异体符号归一，便于跨语种检索 */
export function fold(s) {
  return normalizeText(String(s))
    .replace(/[\uff10-\uff19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48))
    .replace(/[\uff21-\uff3a\uff41-\uff5a]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\uff0c]/g, ",")
    .replace(/[\uff05]/g, "%")
    .replace(/[\uff0e]/g, ".");
}

/**
 * 解析 full.md
 * @returns 结构化事实
 */
export function parseCorpus(md, { id = null } = {}) {
  const text = normalizeText(md);
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
  for (let i = 0; i < lines.length; i++) {
    if (CLAIM_HEADING.test(lines[i].trim())) { claimStart = i; break; }
  }
  if (claimStart >= 0) {
    let curClaim = null;
    for (let i = claimStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (NUMERAL_HEADING.test(line) && line.length < 120) break;
      if (/^\s*(\*{3,}|-{3,})\s*$/.test(line)) break;
      const m = /^\s*(\d{1,3})\.\s+(.*)$/.exec(line);
      if (m) {
        if (curClaim) out.claims.push(curClaim);
        curClaim = { n: Number(m[1]), text: m[2].trim(), line: i + 1 };
      } else if (curClaim && line.trim()) {
        curClaim.text += " " + line.trim();
      }
    }
    if (curClaim) out.claims.push(curClaim);
    // 丢弃编号不连续的尾巴（常见于正文列表误入）
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
        // 跨行标签，接上一行
        out.numeralList[out.numeralList.length - 1].label += " " + line;
      } else if (out.numeralList.length) {
        break;
      }
    }
  }

  /* ---------- 标号集合（清单 + 正文内联提及） ---------- */
  const set = new Map();
  for (const it of out.numeralList) set.set(it.num, it.label);
  const inline = /(?:numeral|reference (?:sign|numeral)|bezugszeichen|ziffer|标号|编号)\s*[（(]?\s*([0-9]{1,3}[a-z]?)/gi;
  let m;
  while ((m = inline.exec(text))) {
    if (!set.has(m[1])) set.set(m[1], "(正文内联提及)");
  }
  out.numerals = [...set.entries()].map(([num, label]) => ({ num, label }));

  /* ---------- 附图 ---------- */
  const figRe = /(?:fig(?:ure)?\.?\s*|图\s*)(\d{1,2}[a-z]?)/gi;
  const figMap = new Map();
  const imgRe = /!\[[^\]]*\]\((images\/[^)]+)\)/g;
  let im;
  while ((im = imgRe.exec(text))) {
    const before = text.slice(Math.max(0, im.index - 200), im.index);
    const fm = [...before.matchAll(figRe)].pop();
    const key = fm ? fm[1] : `img${figMap.size + 1}`;
    if (!figMap.has(key)) figMap.set(key, []);
    figMap.get(key).push(im[1]);
  }
  out.figures = [...figMap.entries()].map(([n, images]) => ({ n, images }));

  /* ---------- 数字 ---------- */
  out.numbers = extractNumbers(text).map((n) => ({ ...n, inClaims: claimAt(text, n.index) }));

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

function claimAt(text, index) {
  return false; // 占位：由 audit 阶段按位置判定，避免解析时重复扫描
}

/** 供审计用：文本中是否出现过某个数字字面量（折叠后比对） */
export function hasNumberLiteral(text, literal) {
  const t = fold(text);
  const l = fold(literal);
  const esc = l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
