/* ============================================================
   scenes-common.js — 调色板与通用几何构件
   ============================================================ */
(function (g) {
  'use strict';
  const A = g.Anatomy;
  const V = A.V;

  const C = {
    steel: '#6b7f96',
    steelLt: '#9fb3c8',
    steelDk: '#41536b',
    steelDeep: '#2b3a4d',
    copper: '#bf6f3c',
    copperLt: '#e2a06c',
    catalyst: '#c98a34',
    catalystDk: '#8a5a1e',
    amber: '#f5a03c',
    amberHot: '#fbbf24',
    cyan: '#2fa8dd',
    cyanLt: '#7dd3fc',
    cyanDeep: '#0e7490',
    steam: '#e6f7ff',
    violet: '#a78bfa',
    green: '#5ad18a',
    red: '#f87171',
    orange: '#fb923c',
    wax: '#c4b5fd',
    water: '#3b82f6',
    white: '#e8eef5'
  };

  function s(fill, opts) {
    const o = Object.assign({ fill: fill }, opts || {});
    return o;
  }
  function glass(fill, alpha) {
    return { fill: fill, alpha: alpha === undefined ? 0.2 : alpha, sw: 0.5, strokeAlpha: 0.35 };
  }

  /* 下压箭头 */
  function arrowDown(b, x, z, yTop, len, w, color, group) {
    const hw = w * 0.26;
    const shaftTop = yTop, shaftBot = yTop - len * 0.62;
    b.box(x - hw, x + hw, shaftBot, shaftTop, z - hw, z + hw, s(color), group);
    const hw2 = w * 0.60;
    const tip = V.pt(x, yTop - len, z);
    const base = [
      V.pt(x - hw2, shaftBot, z - hw2),
      V.pt(x + hw2, shaftBot, z - hw2),
      V.pt(x + hw2, shaftBot, z + hw2),
      V.pt(x - hw2, shaftBot, z + hw2)
    ];
    for (let i = 0; i < 4; i++) {
      b.face([base[i], base[(i + 1) % 4], tip], s(color), group);
    }
    b.face(base.slice().reverse(), s(color), group);
  }

  /* 沿 z 方向的通道阵列（反应层） */
  function reactionLayer(b, opt) {
    const X0 = opt.x0, X1 = opt.x1, Z0 = opt.z0, Z1 = opt.z1;
    const y0 = opt.y0, y1 = opt.y1, n = opt.n || 7, group = opt.group;
    const plate = opt.plate || C.steel;
    const inset = opt.inset === undefined ? 2 : opt.inset;
    const t = 1.1;
    const usable0 = X0 + inset, usable1 = X1 - inset;
    const pitch = (usable1 - usable0) / n;
    const cw = pitch - t;
    b.box(X0, X1, y0, y0 + 1.1, Z0, Z1, s(plate), group);              // 底
    b.box(X0, X0 + inset, y0, y1, Z0, Z1, s(A.shade(plate, 0.8)), group); // 侧
    b.box(X1 - inset, X1, y0, y1, Z0, Z1, s(A.shade(plate, 0.8)), group);
    for (let i = 0; i <= n; i++) {
      const x = usable0 + i * pitch;
      b.box(x - t / 2, x + t / 2, y0 + 1.1, y1, Z0, Z1, s(A.shade(plate, 1.14)), group);
    }
    if (opt.catalyst !== false) {
      for (let i = 0; i < n; i++) {
        const cx = usable0 + i * pitch + pitch / 2;
        b.box(cx - cw / 2, cx + cw / 2, y0 + 1.2, y1 - 0.25, Z0 + 3, Z1 - 3,
          { fill: C.catalyst, alpha: opt.catAlpha === undefined ? 0.5 : opt.catAlpha, sw: 0, stroke: null }, group);
      }
    }
    return { usable0: usable0, pitch: pitch, cw: cw };
  }

  /* 反应层通道中心线（用于粒子流） */
  function channelCenters(geo, n, y, z0, z1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const cx = geo.usable0 + i * geo.pitch + geo.pitch / 2;
      out.push([V.pt(cx, y, z0), V.pt(cx, y, z1)]);
    }
    return out;
  }

  /* 花瓣式冷却场：一条连续蛇形路径（外行 → 端部半圆 → 回行 → 汇流弧） */
  function petalPath(cx, cz, y, R, r0, np, w) {
    const pts = [];
    const step = 0.10;
    const hub = { x: cx, z: cz };
    for (let k = 0; k < np; k++) {
      const a = (k / np) * Math.PI * 2;
      const ux = Math.cos(a), uz = Math.sin(a);
      const vx = -Math.sin(a), vz = Math.cos(a);
      const at = (rr, lat) => A.V.pt(cx + ux * rr + vx * lat, y, cz + uz * rr + vz * lat);
      for (let t = 0; t <= 1.0001; t += step) pts.push(at(r0 + (R - r0) * t, w / 2));
      for (let t = 1; t <= 9; t++) {
        const phi = (t / 9) * Math.PI;
        pts.push(A.V.pt(
          cx + ux * R + vx * (w / 2) * Math.cos(phi) + ux * (w / 2) * Math.sin(phi), y,
          cz + uz * R + vz * (w / 2) * Math.cos(phi) + uz * (w / 2) * Math.sin(phi)
        ));
      }
      for (let t = 1; t >= -0.0001; t -= step) pts.push(at(r0 + (R - r0) * t, -w / 2));
      if (k < np - 1) {
        const a2 = ((k + 1) / np) * Math.PI * 2;
        for (let t = 1; t <= 4; t++) {
          const ang = a + (a2 - a) * (t / 4);
          pts.push(A.V.pt(cx + Math.cos(ang) * r0, y, cz + Math.sin(ang) * r0));
        }
      }
    }
    return pts;
  }

  A.C = C;
  A.s = s;
  A.glass = glass;
  A.arrowDown = arrowDown;
  A.reactionLayer = reactionLayer;
  A.channelCenters = channelCenters;
  A.petalPath = petalPath;
})(window);
