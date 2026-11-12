// lib/bundle.mjs — 把解剖台的多文件站点压成单个自包含 HTML。
// 产出必须是"双击即开"：不依赖相对目录、不依赖网络。
import { readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function bundleSite(dir, outFile) {
  const root = resolve(dir);
  let html = readFileSync(join(root, "index.html"), "utf8");
  const esc = (s) => s.replace(/<\/(script)/gi, "<\\/$1");

  html = html.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/gi, (_, href) => {
    const p = join(root, href);
    return existsSync(p) ? `<style>\n${readFileSync(p, "utf8")}\n</style>` : _;
  });

  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/gi, (_, src) => {
    const p = join(root, src);
    if (!existsSync(p)) throw new Error(`脚本缺失：${src}`);
    return `<script>\n/* ===== ${src} ===== */\n${esc(readFileSync(p, "utf8"))}\n</script>`;
  });

  html = html.replace("</body>", `<script>
(function(){try{var b=document.getElementById('statViews');if(b&&b.textContent==='—'){console.warn('解剖台：脚本未执行');}}catch(e){}})();
</script>
</body>`);

  writeFileSync(outFile, html);
  return { bytes: Buffer.byteLength(html, "utf8"), leftOver: /<script\s+src=|<link[^>]+\.css/i.test(html) };
}
