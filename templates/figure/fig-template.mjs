// fig-template.mjs — 一张"专利结构动态演算图鉴"的最小可跑模板。
// 复制成 work/<id>/build/fig-01.mjs 后整段替换成真结构。命令：node fig-template.mjs
import * as k from "__SKILL__/kit/iso-kit.mjs";
import { basePlate, at as atOf } from "./shared.mjs";

const WIDTH = 660, HEIGHT = 460;

/* ---- 1. 尺寸：全部来自专利，写注释标段落号 ---- */
const PLATE = { x: -132, y: -66, w: 264, d: 132, r: 8 };   // 底板
const BODY = { x: -46, y: -30, w: 92, d: 60, r: 6 };        // 主件（[0013] 给出的长宽）
const BODY_H = 58;                                          // 主件高（[0013]）
const STEM_R = 11;                                          // 立杆半径
const STEM_H = 96;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -14, 0), [0, 0, BODY_H + STEM_H + 20]],
  WIDTH, HEIGHT, { pad: 44, azimuth: 40, elevation: 28 },
);

const at = atOf(P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);

/* ---- 2. 体：先画远景，再画近景（画家序） ---- */
function body() {
  const out = [];
  out.push(basePlate(P, { plan: PLATE, strip: true, label: true }));

  // 主件
  out.push(S(k.slabOf(BODY, 0, BODY_H, P, 6, 2.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BODY, 7), BODY_H, P), { tone: "faint" }));

  // 立杆 + 顶部旋钮
  out.push(S(k.cylinder(0, 0, STEM_R, BODY_H, STEM_H, P, 24), { tone: "hi" }));
  out.push(S(k.cylinder(0, 0, STEM_R + 7, BODY_H + STEM_H, 9, P, 28), { tone: "mid" }));

  // 前面板的两道槽：端点落在主件棱线上，不留悬空线头
  const yFace = -BODY.d / 2;
  const face = [[-26, yFace, 12], [-26, yFace, BODY_H - 12], [26, yFace, BODY_H - 12], [26, yFace, 12]];
  out.push(L(k.pathOf(face.map((q) => at(q)), true), { tone: "lo" }));
  return out.join("");
}

/* ---- 3. 卡片 ---- */
const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: "一张按专利尺寸搭建的装置：底板上立着主件与立杆，前面板开四条通道。",
  body: body(),
});

export const fig01 = {
  fig: "Fig 1",
  title: "{{这张图叫什么}}",
  hint: "上下移动指针，读通道高度",
  readout: "通道 14 mm · 主件 58 mm",
  width: WIDTH, height: HEIGHT,
  keys: [
    { mark: "lit", label: "{{最想让人看到的一件事}}" },
    { mark: "raised", label: "{{部件的真实尺寸与出处}}" },
    { mark: "dim", label: "{{最容易误解的地方}}" },
  ],
  caption: "{{这张图在讲什么、数字从哪来。若图里有模型算出的值，必须写「读数说明：…为模型值」。}}",
  svg,
  script: `
(() => {
  const P = ${JSON.stringify(P)};
  const root = document.getElementById("fig01");
  if (!root) return;
  const readout = root.querySelector("[data-readout]");
  const stage = root.querySelector(".iso-stage");
  // 最小交互：指针上下滑动，读数变化。换成真实物理量。
  stage.addEventListener("pointermove", function (e) {
    const box = stage.getBoundingClientRect();
    const t = 1 - (e.clientY - box.top) / box.height;
    const h = (14 + t * 30).toFixed(0);
    readout.textContent = "通道 " + h + " mm · 主件 58 mm";
  });
})();
`,
};
