// lib/numbers.mjs — 数字抽取、归一与比对。审计的底座。
const UNITS = [
  "mW/cm²", "W/cm²", "W/(m·K)", "g/(g_cat·h)", "g/(g·h)",
  "μm", "µm", "um", "mm", "cm", "km", "nm", "m",
  "kPa", "MPa", "GPa", "bar", "atm", "psi", "Pa",
  "wt%", "mol%", "vol%", "%", "‰",
  "kHz", "MHz", "GHz", "Hz",
  "min", "ms", "µs", "s", "h",
  "mL/min", "ml/min", "L/min", "l/min", "mL/h", "ml/h", "L/h", "l/h", "ml", "mL", "L",
  "kg/h", "g/h", "mg", "kg", "g",
  "mA/cm²", "mA", "kV", "mV", "V", "kW", "W", "kJ", "J",
  "℃", "°C", "C", "K",
  "ppm", "rpm", "bar/h", "1/h", "h⁻¹",
];

const UNIT_ALT = UNITS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

// 数字（含千分位、小数、范围），后接可选单位。
// 先尝试“带千分位分隔符”的写法，再尝试普通整数；不要用 * 让 9000 先匹配成 900。
const NUMBER = "-?(?:\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
const NUM = "(" + NUMBER + ")";
const RANGE = "(?:\\s*(?:[-–—~～]|至|到|to)\\s*(" + NUMBER + "))?";
const RE = new RegExp(`${NUM}${RANGE}\\s*(?:(${UNIT_ALT})(?![A-Za-z]))?`, "g");

/** 折叠：把 , 当小数点、去掉千分位空格 */
export function toCanonicalNumber(s) {
  let t = String(s).trim().replace(/\s+/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  return t;
}

function normUnit(u) {
  if (!u) return "";
  if (u === "C") return "°C";
  return u.replace(/µm|um/g, "μm");
}

export function extractNumbers(text) {
  const out = [];
  const src = String(text);
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 3), m.index);
    const after = src.slice(m.index + m[0].length, m.index + m[0].length + 3);
    // 跳过段落编号 [0013]、图号 Fig. 3、引用标注 [1]
    if (/\[\s*$/.test(before) || /^\s*\]/.test(after)) continue;
    if (/\b(?:fig|figure|图|claim|权项|anspruch)\s*\.?\s*$/i.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;

    const raw = m[0].trim();
    const unit = normUnit(m[3] || "");
    const v1 = toCanonicalNumber(m[1]);
    const v2 = m[2] ? toCanonicalNumber(m[2]) : null;
    const line = src.slice(0, m.index).split("\n").length;
    out.push({
      raw,
      value: v2 ? [v1, v2] : v1,
      unit,
      kind: v2 ? "range" : "scalar",
      index: m.index,
      line,
    });
  }
  return out;
}

/** 生成用于显式比对的字面量集合（含范围的两个端点） */
export function literalSet(numbers) {
  const s = new Set();
  for (const n of numbers) {
    s.add(canon(n.value, n.unit));
    if (Array.isArray(n.value)) {
      s.add(canon(n.value[0], n.unit));
      s.add(canon(n.value[1], n.unit));
      s.add(canon(n.value[0], "") + "-" + canon(n.value[1], ""));
      s.add(canon(n.value[0], "") + "-" + canon(n.value[1], "") + (n.unit || ""));
    }
  }
  return s;
}
export const canon = (v, u) => String(v) + normUnit(u || "");

/** 从一段文本里挑出"看起来像专利数值"的 token（带单位或两位以上小数） */
export function salientNumbers(text) {
  return extractNumbers(text).filter((n) => n.unit || Array.isArray(n.value) || /\d\.\d/.test(String(n.raw)));
}

/** 数字规范化后的宽松键：用于"这个数字在原文里出现过吗" */
export function looseKey(n) {
  if (Array.isArray(n.value)) return `${n.value[0]}~${n.value[1]}${n.unit || ""}`;
  return `${n.value}${n.unit || ""}`;
}
