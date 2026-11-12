// fig-01.mjs — DEMO-0001「一种带分区冷却的微通道反应器」
// 三层叠合：反应层（1）/ 冷却层（2，分成四个冷却场）/ 分配层（3）
import * as k from "__SKILL__/kit/iso-kit.mjs";

const WIDTH = 660, HEIGHT = 470;

/* ---- 尺寸：全部来自专利 ---- */
const PLATE = { x: -150, y: -74, w: 300, d: 148, r: 8 };   // 底座
const LAYER = { x: -110, y: -56, w: 220, d: 112, r: 4 };   // 三层同尺寸
const T_DIST = 10;      // 分配层 3（示意厚度）
const T_COOL = 8;       // 冷却层 2：0.1–5 mm（权项 3）按可读性放大
const T_REACT = 12;     // 反应层 1：通道高 0.4–8 mm（权项 3）按可读性放大
const GAP = 26;         // 装配间隙（爆炸后的间距）
const N_FIELD = 2;      // 每边两个冷却场 → 共四个

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -14, 0), [0, 0, T_DIST + T_COOL + T_REACT + GAP * 2 + 10]],
  WIDTH, HEIGHT, { pad: 44, azimuth: 38, elevation: 27 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);

function body() {
  const out = [];

  /* 底座 */
  out.push(S(k.slabOf(PLATE, -14, 14, P, 8, 2.0), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 8), 0, P), { tone: "faint" }));

  /* 3 分配层 */
  const z3 = 0;
  out.push(S(k.slabOf(LAYER, z3, T_DIST, P, 6, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(LAYER, 6), z3 + T_DIST, P), { tone: "faint" }));

  /* 2 冷却层：四个冷却场 */
  const z2 = T_DIST + GAP;
  out.push(S(k.slabOf(LAYER, z2, T_COOL, P, 6, 1.4), { tone: "lo" }));
  const fw = LAYER.w / N_FIELD, fd = LAYER.d / N_FIELD;
  for (let i = 0; i < N_FIELD; i++) {
    for (let j = 0; j < N_FIELD; j++) {
      const fx = LAYER.x + 6 + i * (fw - 3);
      const fy = LAYER.y + 6 + j * (fd - 3);
      out.push(L(k.planOutline({ x: fx, y: fy, w: fw - 12, d: fd - 12, r: 3 }, z2 + T_COOL, P), { tone: "lo" }));
    }
  }

  /* 1 反应层：沿 y 的反应通道 */
  const z1 = z2 + T_COOL + GAP;
  out.push(S(k.slabOf(LAYER, z1, T_REACT, P, 6, 1.6), { tone: "hi" }));
  for (let i = 0; i < 9; i++) {
    const x = LAYER.x + 16 + i * ((LAYER.w - 32) / 8);
    const w = 3.2;
    out.push(`<path class="iso-shade" data-shade="0" d="${k.pathOf([
      [x - w, LAYER.y + 10, z1 + T_REACT],
      [x + w, LAYER.y + 10, z1 + T_REACT],
      [x + w, LAYER.y + LAYER.d - 10, z1 + T_REACT],
      [x - w, LAYER.y + LAYER.d - 10, z1 + T_REACT],
    ].map((q) => at(q)), true)}"/>`);
  }

  /* 流向：冷液从分配层进，向上翻进冷却场 */
  out.push(L(k.pathOf([[LAYER.x - 26, 0, z3 + T_DIST / 2], [LAYER.x + 20, 0, z3 + T_DIST / 2]], false), { tone: "lit" }));

  return out.join("");
}

const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "三层叠合：底部是分配层，中间是分成四个冷却场的冷却层，顶部是带反应通道的反应层。",
  body: body(),
});

export const fig01 = {
  fig: "Fig 1",
  title: "三层叠合与四个冷却场",
  hint: "上下移动指针，读冷却层与反应通道的厚度",
  readout: "冷却层 0.1–5 mm · 反应通道 0.4–8 mm",
  width: WIDTH, height: HEIGHT,
  keys: [
    { mark: "lit", label: "冷却剂从分配层（3）横向进来，再向上翻进各自的冷却场" },
    { mark: "raised", label: "冷却层（2）被分成两个以上的冷却场，每场单独供液、单独排汽（权项 1）" },
    { mark: "dim", label: "反应层（1）的反应通道高 0.4–8 mm，冷却层厚 0.1–5 mm（权项 3）" },
  ],
  caption:
    "三层叠合：底部是分配层（3），中间是冷却层（2），顶部是反应层（1）。冷却层被分成四个独立的冷却场，每场只跟自己的供液管与排汽管相连——这是权项 1 真正的限定，也是它与常规单侧冷却层的分野。层厚取自权项 3；图中三层的厚度按可读性放大了，实际冷却层只有 0.1–5 mm。读数说明：指针滑动时的数值只是在该区间内取值，用来说明量级，不代表某一具体实施例。",
  svg,
  script: `
/* 读数说明：指针滑动时按区间线性插值，只示量级，不代表某一实施例 */
(() => {
  const root = document.getElementById("fig01");
  if (!root) return;
  const readout = root.querySelector("[data-readout]");
  const stage = root.querySelector(".iso-stage");
  stage.addEventListener("pointermove", function (e) {
    const box = stage.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, 1 - (e.clientY - box.top) / box.height));
    const cool = (0.1 + t * (5 - 0.1)).toFixed(1);
    const react = (0.4 + t * (8 - 0.4)).toFixed(1);
    readout.textContent = "冷却层 " + cool + " mm · 反应通道 " + react + " mm";
  });
})();
`,
};
