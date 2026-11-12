// atlas.mjs — 把 N 张图编成"专利结构动态演算图鉴"一页。
// 用法：node atlas.mjs --light    →  out/专利结构动态演算图鉴.html
//       node atlas.mjs            →  out/专利结构动态演算图鉴-dark.html
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as k from "__SKILL__/kit/iso-kit.mjs";
import { kitScript } from "__SKILL__/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const light = process.argv.includes("--light");

/* 图册清单：按顺序列出每张图的模块与导出名 */
const FIGS = [
  { file: "fig-01.mjs", name: "fig01" },
  // { file: "fig-02.mjs", name: "fig02" },
];

const SHEET_CSS = `
.sheet-head{max-width:660px;margin:0 0 10px}
.sheet-kicker{font-family:var(--anatomy-mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--anatomy-muted);margin:0 0 14px}
.sheet-head h1{font-size:31px;line-height:1.24;letter-spacing:-.01em;margin:0 0 18px;color:var(--anatomy-strong);font-weight:600}
.sheet-lede{font-size:14.5px;line-height:1.9;color:var(--anatomy-text);margin:0 0 12px}
.sheet-figs{margin:44px 0 6px}
.sheet-outro{max-width:660px;margin:46px 0 0}
.sheet-outro h2{font-size:17px;margin:0 0 14px;color:var(--anatomy-strong);font-weight:600}
.sheet-outro p{font-size:13.5px;line-height:1.92;color:var(--anatomy-text);margin:0 0 14px}
`;

const INTRO = `
<header class="sheet-head">
  <p class="sheet-kicker">{{KICKER}}</p>
  <h1>{{H1}}</h1>
  <p class="sheet-lede">{{LEDE}}</p>
</header>`;

const items = [];
for (const f of FIGS) {
  const mod = await import(pathToFileURL(join(HERE, f.file)).href);
  const spec = mod[f.name];
  if (!spec) throw new Error(`${f.file} 未导出 ${f.name}`);
  items.push({ spec, id: f.name });
}

const card = ({ spec, id }) => {
  const plate = k.plateHtml({
    fig: spec.fig, title: spec.title, hint: spec.hint, readout: spec.readout,
    keys: spec.keys, caption: spec.caption,
    body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="${spec.title}">${spec.svg}</div>`,
  });
  return `<div id="${id}">${plate}</div>`;
};

const body = [`<style>${SHEET_CSS}</style>`, INTRO, `<div class="sheet-figs">${items.map(card).join("")}</div>`].join("");

const page = k.pageHtml({
  title: "专利结构动态演算图鉴",
  theme: light ? "light" : "dark",
  body,
  script: kitScript() + items.map(({ spec }) => spec.script || "").join("\n"),
  width: 720,
});

const out = join(HERE, "..", light ? "专利结构动态演算图鉴.html" : "专利结构动态演算图鉴-dark.html");
writeFileSync(out, page);
console.log("wrote", out, (page.length / 1024).toFixed(0) + " KB");
