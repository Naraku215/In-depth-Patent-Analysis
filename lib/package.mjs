// lib/package.mjs — 交付 = 一个 index.html。
//
// 形态：单页三屏（01 解剖台 / 02 图鉴 / 03 深度解析），每屏一张大卡片 + 缩略图 + 打开按钮。
// 三部分的完整文件放在同目录，点卡片直接打开（同标签）。
// 不用 iframe：file:// 下 iframe 的加载行为不稳定，卡片式最可靠。
import { copyFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cfg } from "./paths.mjs";

const escapeHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{
  --paper:#f2f2ef; --card:#fbfbfa; --text:#57575a; --strong:#18181a; --muted:#8c8c90;
  --rule:#dcdcd9; --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--text);
  font-family:"Inter","Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  font-size:15px;line-height:1.85;-webkit-font-smoothing:antialiased}
main{max-width:1080px;margin:0 auto;padding:64px 28px 100px}
.kicker{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}
h1{font-size:30px;line-height:1.28;color:var(--strong);font-weight:600;margin:0 0 14px;letter-spacing:-.01em}
.meta{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin:0 0 8px}
.lede{font-size:14.5px;margin:0 0 6px;max-width:760px}
.cards{margin-top:44px;display:grid;gap:16px}
a.card{display:grid;grid-template-columns:300px 1fr;text-decoration:none;color:inherit;
  background:var(--card);border:1px solid var(--rule);border-radius:14px;overflow:hidden;
  transition:border-color .18s ease,transform .18s ease,box-shadow .18s ease}
a.card:hover{border-color:#bdbdb6;transform:translateY(-2px);
  box-shadow:0 1px 1px -0.5px #0000000c,0 10px 24px -12px #0000001f}
.thumb{background:#e9e9e5;display:flex;align-items:center;justify-content:center;overflow:hidden;
  border-right:1px solid var(--rule);min-height:210px}
.thumb img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.thumb.empty{font-family:var(--mono);font-size:11px;color:var(--muted)}
.body{padding:22px 26px;display:flex;flex-direction:column;justify-content:center}
.no{font-family:var(--mono);font-size:11px;letter-spacing:.14em;color:var(--muted);margin-bottom:6px}
.name{font-size:18px;color:var(--strong);font-weight:600;margin:0 0 8px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.name span{font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:400}
.desc{font-size:13.5px;margin:0;line-height:1.8}
.open{margin-top:12px;font-family:var(--mono);font-size:11.5px;color:var(--strong)}
.open:after{content:" \\2192"}
footer{margin-top:56px;padding-top:18px;border-top:1px solid var(--rule);
  font-family:var(--mono);font-size:11px;color:var(--muted);display:flex;gap:18px;flex-wrap:wrap}
@media(max-width:720px){
  main{padding:40px 16px 72px}
  h1{font-size:23px}
  a.card{grid-template-columns:1fr}
  .thumb{min-height:160px;border-right:0;border-bottom:1px solid var(--rule)}
  .body{padding:18px}
}
`;

const COPY = {
  station: {
    no: "01", name: "专利解剖台", sub: "三维交互",
    desc: "按专利尺寸搭的三维模型：拖动旋转、爆炸分解、可移动剖切面。右侧是逐视图解读与部件标号表。",
    open: "打开解剖台",
  },
  atlas: {
    no: "02", name: "专利结构动态演算图鉴", sub: "等轴测图组",
    desc: "每张图是一台按专利数字搭的装置，指针一动读数就变，附图例与说明。",
    open: "打开图鉴",
  },
  report: {
    no: "03", name: "深度解析", sub: "文档",
    desc: "结论、结构、原理、工艺、数据、权项、证据边界、数值出处附录。固定模板。",
    open: "打开文档",
  },
};

function cardHtml({ kind, file, thumb }) {
  const c = COPY[kind] || { no: "—", name: kind, sub: "", desc: "", open: "打开" };
  const img = thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : `<span>暂无缩略图</span>`;
  return `    <a class="card" href="${escapeHtml(file)}">
      <div class="thumb${thumb ? "" : " empty"}">${img}</div>
      <div class="body">
        <div class="no">${c.no}</div>
        <div class="name">${escapeHtml(c.name)} <span>${escapeHtml(c.sub)}</span></div>
        <p class="desc">${escapeHtml(c.desc)}</p>
        <div class="open">${escapeHtml(c.open)}</div>
      </div>
    </a>`;
}

/**
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.title
 * @param {object} o.meta  {patentNo, builtAt, footnote}
 * @param {{kind:string,file:string,src:string,thumb?:string}[]} o.parts
 */
export function packageOutputs({ id, title, meta, parts }) {
  const dir = join(cfg.outRoot, id);
  if (existsSync(dir)) for (const f of readdirSync(dir)) rmSync(join(dir, f), { recursive: true, force: true });
  mkdirSync(join(dir, "thumbs"), { recursive: true });

  const placed = [];
  for (const p of parts) {
    if (!p.src || !existsSync(p.src)) continue;
    copyFileSync(p.src, join(dir, p.file));
    let thumb = null;
    if (p.thumb && existsSync(p.thumb)) {
      const name = p.kind + ".png";
      copyFileSync(p.thumb, join(dir, "thumbs", name));
      thumb = "thumbs/" + name;
    }
    placed.push({ ...p, thumb });
  }

  const body = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(meta.patentNo || id)} · 专利解析</title>
<style>${CSS}</style></head>
<body><main>
  <p class="kicker">专利解析 · ${escapeHtml(id)}</p>
  <p class="meta">${escapeHtml(meta.patentNo || "")}</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="lede">三部分：一个可以拆开看的三维结构，一组演示原理的工程图，一份可回溯到原文的解读。</p>
  <p class="lede" style="color:var(--muted);font-size:13px">数字与标号都能在专利原文里查到；专利没证明的事写在文档「证据边界」一节。</p>

  <div class="cards">
${placed.map((p) => cardHtml(p)).join("\n")}
  </div>

  <footer>
    <span>${escapeHtml(meta.builtAt || "")}</span>
    <span>${escapeHtml(meta.footnote || "")}</span>
  </footer>
</main></body></html>`;

  writeFileSync(join(dir, "index.html"), body);
  return { dir, index: join(dir, "index.html"), parts: placed.map((p) => p.file) };
}
