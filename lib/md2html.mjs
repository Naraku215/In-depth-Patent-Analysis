// lib/md2html.mjs — 深度解析文档渲染。Markdown 子集：标题/段落/列表/表格/引用/代码块/行内强调。
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  escape(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

export function mdToHtml(md, { title = "专利深度解析", subtitle = "" } = {}) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0, para = [], list = null, quote = [], table = null, fence = null;

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((t) => `<li>${inline(t)}</li>`).join("")}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.map((t) => `<p>${inline(t)}</p>`).join("")}</blockquote>`); quote = []; } };
  const flushTable = () => {
    if (!table) return;
    const cells = (row) => row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const head = cells(table[0]);
    const body = table.slice(2).map(cells);
    out.push("<table><thead><tr>" + head.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>" +
      body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody></table>");
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); flushTable(); };

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      if (fence === null) { flushAll(); fence = []; }
      else { out.push("<pre><code>" + escape(fence.join("\n")) + "</code></pre>"); fence = null; }
      continue;
    }
    if (fence !== null) { fence.push(line); continue; }
    if (!line.trim()) { flushAll(); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { flushAll(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { flushAll(); out.push("<hr>"); continue; }
    if (line.startsWith("> ")) { flushPara(); flushList(); flushTable(); quote.push(line.slice(2)); continue; }
    if (line.trim().startsWith("|")) { flushPara(); flushList(); flushQuote(); (table ||= []).push(line.trim()); continue; }
    const ol = /^(\d+)\.\s+(.*)$/.exec(line);
    if (ol) { flushPara(); flushQuote(); flushTable(); if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; } list.items.push(ol[2]); continue; }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) { flushPara(); flushQuote(); flushTable(); if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; } list.items.push(ul[1]); continue; }
    flushList(); flushQuote(); flushTable(); para.push(line.trim());
  }
  flushAll();

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
:root{--paper:#f2f2ef;--card:#fbfbfa;--text:#57575a;--strong:#18181a;--muted:#8c8c90;--rule:#dcdcd9;--code:#3a3a3e}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--text);font-family:"Inter","Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;font-size:15px;line-height:1.9;-webkit-font-smoothing:antialiased}
main{max-width:780px;margin:0 auto;padding:72px 26px 120px}
h1{font-size:31px;line-height:1.3;color:var(--strong);font-weight:600;margin:0 0 10px;letter-spacing:-.01em}
h2{font-size:20px;color:var(--strong);font-weight:600;margin:46px 0 16px}
h3{font-size:16.5px;color:var(--strong);font-weight:600;margin:38px 0 12px}
h4{font-size:14px;color:var(--strong);font-weight:600;margin:26px 0 8px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.02em}
p{margin:0 0 14px}
strong{color:var(--strong);font-weight:600}
code{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.9em;background:#e9e9e5;border-radius:3px;padding:1px 5px;color:var(--code)}
pre{background:#e9e9e5;border-radius:8px;padding:14px 16px;overflow:auto;font-size:12.5px;line-height:1.6}
pre code{background:none;padding:0}
hr{border:0;border-top:1px solid var(--rule);margin:34px 0}
blockquote{margin:0 0 20px;padding:2px 0 2px 16px;border-left:2px solid #b9b9b2}
blockquote p{margin:0 0 6px;color:var(--muted)}
ol,ul{margin:0 0 16px;padding-left:22px}
li{margin:0 0 7px}
table{width:100%;border-collapse:collapse;margin:20px 0 24px;font-size:12.5px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
th{text-align:left;font-weight:500;color:var(--muted);padding:8px;border-bottom:1px solid #b9b9b2;white-space:nowrap}
td{padding:8px;border-bottom:1px solid var(--rule);line-height:1.55;vertical-align:top}
td:first-child{color:var(--strong);white-space:nowrap}
@media(max-width:560px){main{padding:44px 16px 80px}h1{font-size:24px}h2{font-size:18px}table{font-size:11px}}
</style></head><body><main>
${subtitle ? `<p style="font-family:ui-monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 14px">${escape(subtitle)}</p>` : ""}
${out.join("\n")}
</main></body></html>`;
}
