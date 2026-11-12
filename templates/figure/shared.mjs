// shared.mjs — 四张图共用的底座、色阶与任意方向棱柱
import * as k from "__SKILL__/kit/iso-kit.mjs";

export { k };

export const WIDTH = 660;
export const HEIGHT = 420;

export const PLATE = { x: -152, y: -78, w: 304, d: 156, r: 9 };
export const PLATE_H = 12;
export const FOOT_H = 5;

/** 世界坐标点 → 屏幕 */
export const at = (P) => (p) => k.iso(p, P);

/** 按深度给一组平面点排序（远先画） */
export const byDepth = (P) => (points) =>
  [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

/** 底座：halo、四只脚、主板、凹槽、角螺钉、标尺条、铭牌 */
export function basePlate(P, { plan = PLATE, strip = true, label = true } = {}) {
  const out = [];
  const depth = byDepth(P);
  const { x, y, w, d, r } = plan;
  const inset = Math.max(10, Math.min(22, Math.min(w, d) * 0.18));
  out.push(`<path class="iso-halo" d="${k.haloOf(plan, -PLATE_H - FOOT_H, PLATE_H + FOOT_H, P)}"/>`);
  for (const [fx, fy] of depth(k.corners(plan, inset))) {
    out.push(k.solidSvg(k.cylinder(fx, fy, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(k.solidSvg(k.cylinder(fx, fy, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6 - 1.4, P, 28), { tone: "mid" }));
  }
  out.push(k.solidSvg(k.slabOf(plan, -PLATE_H, PLATE_H, P, 8, 1.8), { tone: "mid" }));
  out.push(k.lineSvg(k.planOutline(k.insetPlan(plan, Math.max(5, Math.min(6, w * 0.05))), 0, P), { tone: "faint" }));
  const screws = k.corners(plan, inset * 0.55);
  out.push(k.lineSvg(screws.map(([sx, sy]) => k.ring(sx, sy, 2.3, 0, P, 18)).join(""), { tone: "lo" }));
  out.push(k.dotsSvg(screws.map(([sx, sy]) => k.iso([sx, sy, 0], P)), { size: 0.5, tone: "mid" }));

  if (strip) {
    const s = { x: x + 14, y: y + d - 15, w: w - 28, d: 6.4, r: 1 };
    out.push(k.solidSvg(k.slabOf(s, 0, 0.7, P, 3), { tone: "lo", crease: "none" }));
    const t = k.topTicks(s.x + 5, s.x + s.w - 5, 5, 5, s.y + 0.9, 0.7, [2, 3.8], P);
    out.push(k.lineSvg(t.minor, { tone: "lo" }), k.lineSvg(t.major, { tone: "mid" }));
    out.push(k.dotsSvg([k.iso([s.x + 2, s.y + 3.3, 0.7], P), k.iso([s.x + s.w - 2, s.y + 3.3, 0.7], P)], { size: 0.45 }));
  }
  if (label) {
    const plate = { x: x + 10, y: y + 12, w: 56, d: 21, r: 2 };
    out.push(k.solidSvg(k.slabOf(plate, 0, 0.9, P, 4), { tone: "lo", crease: "none" }));
    out.push(k.lineSvg(k.planOutline(k.insetPlan(plate, 2.2), 0.9, P), { tone: "faint" }));
    for (let i = 0; i < 3; i++) {
      out.push(k.lineSvg(k.lineOnTop([plate.x + 5, plate.y + 7 + i * 5], [plate.x + plate.w - (i === 2 ? 21 : 6), plate.y + 7 + i * 5], 0.9, P), { tone: "lo", free: true }));
    }
    out.push(k.dotsSvg([k.iso([plate.x + 3, plate.y + 3, 0.9], P), k.iso([plate.x + plate.w - 3, plate.y + 3, 0.9], P)], { size: 0.4 }));
  }
  return out.join("");
}

/* ---------- 任意方向棱柱：截面在 (x,z) 平面，沿 y 拉伸 ----------
   相机在 +x +y 上，所以近面取 y = y1。 */
const LIGHT_X = -Math.SQRT1_2;
const LIGHT_Z = Math.SQRT1_2;
const VIEW_X = 0.6124;
const VIEW_Z = 0.5;

export function sheetXZ(ring, y0, y1, P, { tone = "hi", near = "iso-top", className = "", lit = false } = {}) {
  const count = ring.length;
  let area = 0;
  for (let i = 0; i < count; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % count];
    area += ax * bz - bx * az;
  }
  const ccw = area > 0;
  const far = ring.map(([x, z]) => [x, y0, z]);
  const nearPts = ring.map(([x, z]) => [x, y1, z]);
  const band = [];
  const shades = [[], [], [], []];
  for (let i = 0; i < count; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % count];
    const dx = bx - ax, dz = bz - az;
    const length = Math.hypot(dx, dz) || 1;
    let nx = dz / length, nz = -dx / length;
    if (!ccw) { nx = -nx; nz = -nz; }
    if (nx * VIEW_X + nz * VIEW_Z <= 1e-6) continue;
    const lum = (nx * LIGHT_X + nz * LIGHT_Z + 1) / 2;
    const shade = Math.min(3, Math.max(0, Math.floor(lum * 4)));
    const quad = [
      [ax, y1, az], [bx, y1, bz], [bx, y0, bz], [ax, y0, az]
    ].map((p) => k.iso(p, P));
    shades[shade].push(k.pathOf(quad, true));
  }
  for (let s = 0; s < 4; s++) {
    if (shades[s].length) band.push(`<path class="iso-shade" data-shade="${s}" d="${shades[s].join("")}"/>`);
  }
  const face = k.pathOf(nearPts.map((p) => k.iso(p, P)), true);
  const body = `<g class="iso-solid${lit ? "" : ""}" data-tone="${tone}"${lit ? " data-lit" : ""}>` +
    band.join("") +
    `<path class="${near}" d="${face}"/>` +
    `</g>`;
  const outline = k.lineSvg(face, { tone, className }) +
    k.lineSvg(k.pathOf(far.map((p) => k.iso(p, P)), true), { tone: "lo" });
  return body + outline;
}

/** 沿 y 拉伸的简单板（四角柱），用于夹板、隔板 */
export function slabXZ(x0, x1, z0, z1, y0, y1, P, { tone = "hi", near = "iso-top" } = {}) {
  return sheetXZ([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, P, { tone, near });
}

/** 剖面轮廓：给中心线加厚成闭合环 */
export function thicken(center, thick) {
  const up = [], dn = [];
  for (let i = 0; i < center.length; i++) {
    const p = center[i];
    const a = center[Math.max(0, i - 1)];
    const b = center[Math.min(center.length - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let nz = b[0] - a[0];
    const length = Math.hypot(nx, nz) || 1;
    nx /= length; nz /= length;
    up.push([p[0] + nx * thick / 2, p[1] + nz * thick / 2]);
    dn.push([p[0] - nx * thick / 2, p[1] - nz * thick / 2]);
  }
  return up.concat(dn.reverse());
}

/** 波形片截面中心线 */
export function waveCenter({ n = 3, pitch = 9, width = 7.4, height = 32, lean = 0, bow = 0, spank = true, samples = 6 }) {
  const x0 = -(n * pitch) / 2;
  const smooth = (t) => t * t * (3 - 2 * t);
  const pts = [[x0 - 1.6, 0]];
  for (let i = 0; i < n; i++) {
    const xb = x0 + i * pitch;
    const up = (t) => spank ? lean * smooth(t) + bow * Math.sin(Math.PI * t) : bow * Math.sin(Math.PI * t);
    const down = (t) => spank ? lean * smooth(t) + bow * Math.sin(Math.PI * t) : -bow * Math.sin(Math.PI * t);
    for (let s = 0; s <= samples; s++) { const t = s / samples; pts.push([xb + up(t), t * height]); }
    for (let s = samples; s >= 0; s--) { const t = s / samples; pts.push([xb + width + down(t), t * height]); }
    pts.push([xb + width + (pitch - width) / 2, 0]);
  }
  pts.push([x0 + n * pitch + 1.6, 0]);
  return pts;
}

/** 画一个小螺钉 */
export function screwDot(P, x, y, z, size = 0.5) {
  return k.dotsSvg([k.iso([x, y, z], P)], { size, tone: "mid" });
}

/** 圆盘刻度表（正面朝上） */
export function dialFace(P, cx, cy, z, R, label) {
  const out = [];
  const top = z + 9;
  out.push(k.solidSvg(k.cylinder(cx, cy, R, z, 9, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(k.lineSvg(k.knurl(cx, cy, R, top - 3.2, top, 84, P, 0.3), { tone: "lo" }));
  out.push(k.lineSvg(k.sideArc(cx, cy, R, top - 3.2, P, 40), { tone: "faint" }));
  out.push(k.lineSvg(k.ring(cx, cy, R - 2.4, top, P, 64), { tone: "lo" }));
  const t = k.radialTicks(cx, cy, R - 3.4, 40, 5, top, [1.2, 2.6], P);
  out.push(k.lineSvg(t.minor, { tone: "lo" }), k.lineSvg(t.major, { tone: "mid" }));
  out.push(k.lineSvg(k.ring(cx, cy, 1.7, top, P, 16), { tone: "mid" }));
  if (label) out.push(k.faceTextSvg(k.topMatrix([cx, cy + R * 0.45], top, P, "x"), label, { size: R * 0.17, tone: "lo", anchor: "middle" }));
  return { body: out.join(""), top };
}

export const PT = (x, y, z) => [x, y, z];
