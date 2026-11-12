// test/run.mjs — 自检。验证"一次一件 → 三部分 → 一个 index"这条链路真的通。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, "bin", "patent.mjs");
const ID = "DEMO-0001";

let pass = 0, fail = 0;
const results = [];

function check(name, fn) {
  try {
    const r = fn() || {};
    const ok = r.ok !== false;
    results.push({ name, ok, detail: r.detail || "" });
    ok ? pass++ : fail++;
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    fail++;
  }
}
function run(args, { allowFail = false } = {}) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    if (!allowFail) throw new Error(`${args.join(" ")} 失败：${(e.stderr || e.stdout || "").slice(0, 400)}`);
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}
const clean = (p) => { try { rmSync(p, { recursive: true, force: true }); } catch {} };

console.log("专利解析 agent · 自检\n");

check("doctor：环境完整", () => {
  const r = run(["doctor"]);
  return { ok: !/FAIL/.test(r.out), detail: "node / skill / 输入目录" };
});

check("一次一件：带 all 被拒绝", () => {
  const r = run(["extract", "all"], { allowFail: true });
  return { ok: r.code !== 0 && /一次只解析一件/.test(r.out), detail: "不支持批量" };
});

clean(join(ROOT, "work", ID));
clean(join(ROOT, "out", ID));

check("init + extract：解析出权项与标号", () => {
  run(["init", ID]);
  run(["extract", ID]);
  const f = JSON.parse(readFileSync(join(ROOT, "work", ID, "facts.json"), "utf8"));
  return {
    ok: f.claims.length === 3 && f.numerals.length >= 5 && f.paragraphs.length >= 8,
    detail: `权项 ${f.claims.length} · 标号 ${f.numerals.length} · 段落 ${f.paragraphs.length}`,
  };
});

check("build：三部分都产出", () => {
  // 把示例的成稿内容铺进工作区（模拟 agent 写完这一步）
  const A = join(ROOT, "examples", "DEMO-0001-authoring");
  const W = join(ROOT, "work", ID);
  copyFileSync(join(A, "doc.md"), join(W, "doc.md"));
  copyFileSync(join(A, "fig-01.mjs"), join(W, "build", "fig-01.mjs"));
  copyFileSync(join(A, "report.js"), join(W, "station", "js", "report.js"));
  run(["build", ID]);
  const need = ["专利解剖台.html", "专利结构动态演算图鉴.html", "专利深度解析.md", "专利深度解析.html"];
  const missing = need.filter((f) => !existsSync(join(ROOT, "work", ID, f)));
  return { ok: !missing.length, detail: missing.length ? "缺 " + missing.join(",") : need.length + " 个文件" };
});

check("check：干净产出满分", () => {
  const r = run(["check", ID], { allowFail: true });
  return { ok: r.code === 0 && /100 \/ 100/.test(r.out), detail: (r.out.match(/评分：\d+ \/ 100/) || [""])[0] };
});

check("check：抓出编造数字 / 标号 / 越权项", () => {
  const doc = join(ROOT, "work", ID, "doc.md");
  const orig = readFileSync(doc, "utf8");
  try {
    writeFileSync(doc, orig + "\n\n自检注入：宽度 12.7 mm，见标号 42，依据权项 9。\n");
    const r = run(["check", ID], { allowFail: true });
    const a = /E-NUM-UNTRACED/.test(r.out);
    const b = /E-NUMERAL-UNKNOWN/.test(r.out);
    const c = /E-CLAIM/.test(r.out);
    return { ok: r.code !== 0 && a && b && c, detail: `数字=${a} 标号=${b} 权项=${c}` };
  } finally {
    writeFileSync(doc, orig);
  }
});

check("package：校验不过就拒绝出包", () => {
  const doc = join(ROOT, "work", ID, "doc.md");
  const orig = readFileSync(doc, "utf8");
  try {
    writeFileSync(doc, orig + "\n\n再注入：压力 7.7 bar。\n");
    const r = run(["package", ID], { allowFail: true });
    return { ok: r.code !== 0 && /校验未通过/.test(r.out), detail: r.code !== 0 ? "已拒绝" : "竟然出包了" };
  } finally {
    writeFileSync(doc, orig);
  }
});

check("package：一个 index + 三部分 + 缩略图", () => {
  const r = run(["package", ID], { allowFail: true });
  if (r.code !== 0) return { ok: false, detail: "package 失败：" + r.out.slice(0, 300) };
  const dir = join(ROOT, "out", ID);
  const top = readdirSync(dir).sort();
  const need = ["index.html", "01-station.html", "02-atlas.html", "03-report.html"];
  const missing = need.filter((f) => !top.includes(f));
  const thumbs = existsSync(join(dir, "thumbs")) ? readdirSync(join(dir, "thumbs")).length : 0;
  const noAudit = !top.some((f) => /审计|audit/i.test(f));
  return { ok: !missing.length && noAudit && thumbs >= 3, detail: `缺: ${missing.join(",") || "无"} · 缩略图 ${thumbs} · 无审计文件 ${noAudit}` };
});

console.log("");
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? "  —  " + r.detail : ""}`);
console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
