/* ============================================================
   scenes-a.js — 专利一（US 10,150,093 B2）与 专利二（US 2026/0077327 A1）
   ============================================================ */
(function (g) {
  'use strict';
  const A = g.Anatomy, V = A.V, C = A.C, s = A.s, glass = A.glass;
  const P = (x, y, z) => V.pt(x, y, z);

  function makeScene(b, opt) {
    opt = opt || {};
    return {
      items: b.items, groups: b.groups, labels: b.labels, flows: b.flows,
      bounds: b.finish(),
      view: opt.view || {}, tick: opt.tick || null
    };
  }

  /* ============================================================
     专利一 · US 10,150,093 B2
     ============================================================ */
  const X0 = -32, X1 = 32, Z0 = -30, Z1 = 30;
  const P1_LAYERS = [
    { g: 'L1', y0: 0, y1: 8, kind: 'react' },
    { g: 'L2', y0: 8, y1: 11, kind: 'cool' },
    { g: 'L3', y0: 11, y1: 19, kind: 'dist' },
    { g: 'L4', y0: 19, y1: 27, kind: 'dist' },
    { g: 'L5', y0: 27, y1: 30, kind: 'cool' },
    { g: 'L6', y0: 30, y1: 38, kind: 'react' }
  ];
  const P1_FIELDS = [
    { x: -15, z: -14 }, { x: 15, z: -14 }, { x: -15, z: 14 }, { x: 15, z: 14 }
  ];
  const P1_MAIN = P1_FIELDS[1];
  const PETAL = [12.2, 2.4, 8, 3.6];

  function p1Groups(b, spread) {
    P1_LAYERS.forEach(function (L, i) {
      b.group(L.g, { explode: [0, (i - 2.5) * spread, 0] });
    });
  }

  function p1CoolLayer(b, y0, y1, group) {
    b.box(X0, X1, y0, y1, Z0, Z1, glass(C.cyanLt, 0.13), group);
    const y = (y0 + y1) / 2;
    P1_FIELDS.forEach(function (f) {
      b.line(A.petalPath(f.x, f.z, y, PETAL[0], PETAL[1], PETAL[2], PETAL[3]),
        { stroke: C.cyanLt, sw: 1.1, alpha: 0.9 }, group);
      b.line([P(f.x - 13.2, y, f.z - 13.2), P(f.x + 13.2, y, f.z - 13.2),
      P(f.x + 13.2, y, f.z + 13.2), P(f.x - 13.2, y, f.z + 13.2), P(f.x - 13.2, y, f.z - 13.2)],
        { stroke: C.cyanDeep, sw: 0.7, alpha: 0.5, dash: '3 3' }, group);
    });
  }

  function p1DistLayer(b, y0, y1, group) {
    b.box(X0, X1, y0, y1, Z0, Z1, glass(C.steelLt, 0.08), group);
    const y = (y0 + y1) / 2;
    b.tube([P(X0 + 2, y, Z0 + 3), P(X0 + 2, y, Z1 - 3)], 1.5, s(C.cyan), group, 5);
    b.tube([P(X1 - 2, y, Z0 + 3), P(X1 - 2, y, Z1 - 3)], 1.5, s(C.steam), group, 5);
    P1_FIELDS.forEach(function (f) {
      b.tube([P(X0 + 2, y, f.z - 9.5), P(f.x, y, f.z - 9.5), P(f.x, y, f.z - 5.2)], 0.95, s(C.cyan), group, 4);
      b.tube([P(f.x, y, f.z + 5.2), P(f.x, y, f.z + 9.5), P(X1 - 2, y, f.z + 9.5)], 0.95, s(C.steam), group, 4);
    });
  }

  function p1ReactLayer(b, y0, y1, group, withFlows) {
    const geo = A.reactionLayer(b, { x0: X0, x1: X1, z0: Z0, z1: Z1, y0: y0, y1: y1, n: 7, group: group });
    if (withFlows) {
      const y = (y0 + y1) / 2 + 0.4;
      A.channelCenters(geo, 7, y, Z0 + 1, Z1 - 1).forEach(function (p) {
        b.flow(p, { count: 3, speed: 0.30, size: 2.3, color: C.amberHot, color2: C.violet, opacity: 0.95 });
      });
    }
    return geo;
  }

  function p1FieldPath(f, y) {
    const pts = [];
    pts.push(P(X0 + 1, y, f.z - 9.5));
    pts.push(P(f.x, y, f.z - 9.5));
    pts.push(P(f.x, y, f.z - 5.2));
    A.petalPath(f.x, f.z, y, PETAL[0], PETAL[1], PETAL[2], PETAL[3]).forEach(function (p) { pts.push(p); });
    pts.push(P(f.x, y, f.z + 5.2));
    pts.push(P(f.x, y, f.z + 9.5));
    pts.push(P(X1 - 1, y, f.z + 9.5));
    return pts;
  }

  /* ---- 视图 1：叠层解剖 ---- */
  function p1Stack() {
    const b = new A.Builder();
    p1Groups(b, 24);
    P1_LAYERS.forEach(function (L) {
      if (L.kind === 'react') p1ReactLayer(b, L.y0, L.y1, L.g, true);
      else if (L.kind === 'cool') p1CoolLayer(b, L.y0, L.y1, L.g);
      else p1DistLayer(b, L.y0, L.y1, L.g);
    });
    P1_FIELDS.forEach(function (f) {
      b.flow(p1FieldPath(f, 9.5), { count: 12, speed: 0.11, size: 2.5, color: C.cyan, color2: C.steam, opacity: 0.95, group: 'L2' });
      b.flow(p1FieldPath(f, 28.5), { count: 12, speed: 0.11, size: 2.5, color: C.cyan, color2: C.steam, opacity: 0.95, group: 'L5' });
    });
    b.label([X1, 37, Z1], '1 反应层 a)', { color: C.amberHot, group: 'L6', dx: 18 });
    b.label([X1, 29, Z1], '2 冷却层 b)', { color: C.cyanLt, group: 'L5', dx: 18 });
    b.label([X1, 25, Z1], '3 分配层 c)', { color: C.steelLt, group: 'L4', dx: 18 });
    b.label([X1, 15, Z1], '3′ 镜像', { color: C.steelLt, group: 'L3', dx: 18 });
    b.label([X1, 4, Z1], '1′–3′ 镜像序列', { color: C.steelLt, group: 'L1', dx: 18 });
    b.label([X0, 37, Z0], '冷却剂 4 → 蒸汽 5', { color: C.cyan, group: 'L6', dx: -18, anchor: 'end' });
    return makeScene(b, { view: { yaw: -0.70, pitch: 0.30, zoom: 1.0, explode: 0.55 } });
  }

  /* ---- 视图 2：冷却场花瓣流道 ---- */
  function p1Field() {
    const b = new A.Builder();
    b.group('plate', {});
    b.group('walls', { explode: [0, 15, 0] });
    b.box(X0, X1, 18, 26, Z0, Z1, glass(C.steel, 0.15), 'walls');
    b.box(X0, X1, 8, 11, Z0, Z1, glass(C.cyanLt, 0.10), 'plate');
    const y = 9.6;
    P1_FIELDS.forEach(function (f, i) {
      const isMain = i === 1;
      b.line(A.petalPath(f.x, f.z, y, PETAL[0], PETAL[1], PETAL[2], PETAL[3]),
        { stroke: isMain ? C.steam : C.cyanLt, sw: isMain ? 2.0 : 1.0, alpha: isMain ? 1 : 0.4 }, 'plate');
      b.line([P(f.x - 13.2, y, f.z - 13.2), P(f.x + 13.2, y, f.z - 13.2),
      P(f.x + 13.2, y, f.z + 13.2), P(f.x - 13.2, y, f.z + 13.2), P(f.x - 13.2, y, f.z - 13.2)],
        { stroke: isMain ? C.cyan : C.steelDk, sw: isMain ? 1.2 : 0.6, alpha: isMain ? 1 : 0.4 }, 'plate');
      b.flow(p1FieldPath(f, y), {
        count: isMain ? 20 : 7, speed: 0.13, size: isMain ? 3.2 : 2.0,
        color: C.cyan, color2: C.steam, opacity: isMain ? 1 : 0.32, group: 'plate'
      });
    });
    b.label([P1_MAIN.x, 12.4, P1_MAIN.z], '6 冷却场：每个场独立供液，场内有折弯', { color: C.cyanLt, dx: 0, dy: -96, anchor: 'middle' });
    b.label([X0 + 1, y, P1_MAIN.z - 9.5], '7 供液', { color: C.cyan, dx: -12, dy: -6, anchor: 'end' });
    b.label([X1 - 1, y, P1_MAIN.z + 9.5], '9 排汽', { color: C.steam, dx: 12, dy: -6 });
    b.label([0, 26, Z0], '11 反应介质纵向 / 12 冷却剂横向（错流）', { color: C.violet, dx: 0, dy: -16, anchor: 'middle', group: 'walls' });
    return makeScene(b, { view: { yaw: -0.58, pitch: 0.50, zoom: 1.0, explode: 0.6 } });
  }

  /* ---- 视图 3：分配器错流 ---- */
  function p1Dist() {
    const b = new A.Builder();
    b.group('dist', {});
    b.group('cool', { explode: [0, 13, 0] });
    b.group('react', { explode: [0, 27, 0] });
    p1DistLayer(b, 0, 8, 'dist');
    p1CoolLayer(b, 9, 12, 'cool');
    p1ReactLayer(b, 14, 22, 'react', false);
    for (let i = 0; i < 5; i++) {
      A.arrowDown(b, -24 + i * 12, Z1 + 9, 33, 8, 5.0, C.amber, 'react');
    }
    b.flow([P(X0 + 2, 4, Z0), P(X0 + 2, 4, Z1)], { count: 5, speed: 0.13, size: 3, color: C.cyan, group: 'dist' });
    b.flow([P(X1 - 2, 4, Z1), P(X1 - 2, 4, Z0)], { count: 5, speed: 0.13, size: 3, color: C.steam, group: 'dist' });
    P1_FIELDS.forEach(function (f) {
      b.flow(p1FieldPath(f, 10.5), { count: 8, speed: 0.12, size: 2.5, color: C.cyan, color2: C.steam, group: 'cool' });
    });
    b.label([X0 + 2, 4, Z0], '7 冷却剂（横向）', { color: C.cyan, dx: -10, anchor: 'end' });
    b.label([X1 - 2, 4, Z0], '9 蒸汽（横向）', { color: C.steam, dx: 10 });
    b.label([0, 4, Z0], '供液与排汽在分配层交错布置 → 间距最大化，热短路最小', { color: C.steelLt, dx: 0, dy: 26, anchor: 'middle' });
    b.label([0, 33, Z1 + 9], '反应介质 13（纵向 11）', { color: C.amberHot, dx: 0, dy: -16, anchor: 'middle', group: 'react' });
    return makeScene(b, { view: { yaw: -0.26, pitch: 0.66, zoom: 1.0, explode: 0.55 } });
  }

  /* ---- 视图 4：局部蒸干 / 气泡阻塞 ---- */
  function p1Evap() {
    const b = new A.Builder();
    b.group('wall', {});
    b.group('fluid', {});
    const x0 = -30, x1 = 30, z0 = -12, z1 = 12;
    b.box(x0, x1, 10, 12.5, z0, z1, s(C.amber), 'wall');
    for (let i = 0; i < 7; i++) {
      const cz = z0 + 3 + i * 2.6;
      b.box(x0 + 2, x1 - 2, 12.5, 16, cz - 0.7, cz + 0.7, { fill: C.catalyst, alpha: 0.65, stroke: null }, 'wall');
    }
    b.box(x0, x1, 0, 10, z0, z1, glass(C.cyanLt, 0.07), 'fluid');
    b.box(x0 + 1, x1 - 1, 0.4, 2.6, z0 + 1, z1 - 1, { fill: C.water, alpha: 0.5, stroke: null }, 'fluid');
    b.box(6, 26, 0.4, 9.4, z0 + 1, z1 - 1, { fill: C.steam, alpha: 0.11, stroke: null }, 'fluid');
    b.box(6, 26, 10.02, 12.52, z0 + 0.2, z1 - 0.2, { fill: C.red, alpha: 0.45, sw: 0, stroke: null }, 'wall');
    for (let i = 0; i < 15; i++) {
      const bx = -27 + i * 3.6;
      const zz = -7 + (i % 3) * 6;
      b.flow([P(bx, 0.9, zz), P(bx + (i % 2 ? 1.0 : -1.0), 5.4, zz), P(bx, 9.0, zz)],
        {
          count: 2, speed: 0.15 + 0.03 * (i % 4), size: 2.0, color: C.steam, opacity: 0.8, group: 'fluid',
          sizeFn: function (u) { return 1.3 + 2.4 * u; }
        });
    }
    b.label([0, 16.8, 0], '反应壁：气泡覆盖区 → 局部过热', { color: C.red, anchor: 'middle', dx: 0, dy: -10, group: 'wall' });
    b.label([26, 7, z1], '干涸区：传热系数骤降', { color: C.steam, dx: 14, dy: -12, group: 'fluid' });
    b.label([-27, 1.6, z1], '液膜（未蒸干段）', { color: C.water, dx: 10, dy: 16, group: 'fluid' });
    b.label([x0, 11.2, z0], '层 a) 反应侧', { color: C.amber, dx: -10, dy: -10, anchor: 'end', group: 'wall' });
    return makeScene(b, { view: { yaw: -0.18, pitch: 0.28, zoom: 1.05 } });
  }

  /* ---- 面板：等温性对比 ---- */
  function p1StatePanel() {
    const W = 760, H = 430;
    const L = 78, R = 726, T = 44, Bm = 330;
    const x = t => L + (R - L) * t;
    const Y = v => Bm - (v - 185) / 105 * (Bm - T);
    const yPrior = t => Y(200 + 64 * t);
    const yInv = t => Y(212 + 1.5 * Math.sin(t * 6.4));
    let p1 = '', p2 = '';
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      p1 += (i ? 'L' : 'M') + x(t).toFixed(1) + ',' + yPrior(t).toFixed(1);
      p2 += (i ? 'L' : 'M') + x(t).toFixed(1) + ',' + yInv(t).toFixed(1);
    }
    let grid = '';
    for (let v = 185; v <= 290; v += 15) {
      grid += `<line x1="${L}" y1="${Y(v).toFixed(1)}" x2="${R}" y2="${Y(v).toFixed(1)}" stroke="#1b2839" stroke-width="1"/>`;
      grid += `<text x="${L - 10}" y="${(Y(v) + 4).toFixed(1)}" fill="#5b6b80" font-size="11" text-anchor="end" font-family="ui-monospace,monospace">${v}</text>`;
    }
    let marks = '';
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      marks += `<text x="${x(t).toFixed(1)}" y="${Bm + 22}" fill="#5b6b80" font-size="11" text-anchor="middle" font-family="ui-monospace,monospace">${i * 10}%</text>`;
      marks += `<line x1="${x(t).toFixed(1)}" y1="${Bm}" x2="${x(t).toFixed(1)}" y2="${Bm + 5}" stroke="#334155"/>`;
    }
    const gy = Y(248);
    return `<svg viewBox="0 0 ${W} ${H}" class="panel-svg" preserveAspectRatio="xMidYMid meet">
      <rect x="${L}" y="${gy.toFixed(1)}" width="${R - L}" height="${(Bm - gy).toFixed(1)}" fill="#7f1d1d" opacity="0.22"/>
      ${grid}
      <text x="${R - 6}" y="${(gy - 8).toFixed(1)}" fill="#fca5a5" font-size="11" text-anchor="end" font-family="ui-monospace,monospace">催化剂失活 / 甲烷选择性失控区</text>
      <line x1="${L}" y1="${Bm}" x2="${R}" y2="${Bm}" stroke="#334155"/>
      <line x1="${L}" y1="${T}" x2="${L}" y2="${Bm}" stroke="#334155"/>
      ${marks}
      <path d="${p1}" fill="none" stroke="#f87171" stroke-width="2.8"/>
      <path d="${p2}" fill="none" stroke="#38e0b0" stroke-width="2.8"/>
      <text x="${x(0.55).toFixed(1)}" y="${(yPrior(0.55) - 14).toFixed(1)}" fill="#f87171" font-size="12.5" font-family="ui-monospace,monospace">传统单程冷却：沿程升温 ≈ 64℃</text>
      <text x="${x(0.06).toFixed(1)}" y="${(yInv(0.06) - 16).toFixed(1)}" fill="#38e0b0" font-size="12.5" font-family="ui-monospace,monospace">本发明逐场独立供液：ΔT ≈ ±1.5℃</text>
      <text x="${(L + R) / 2}" y="${Bm + 54}" fill="#94a3b8" font-size="12" text-anchor="middle" font-family="ui-monospace,monospace">沿反应通道的相对位置 →</text>
      <text x="20" y="${(T + Bm) / 2}" fill="#94a3b8" font-size="12" text-anchor="middle" font-family="ui-monospace,monospace" transform="rotate(-90 20 ${(T + Bm) / 2})">反应通道温度 ℃</text>
    </svg>`;
  }

  A.scenes.p1 = {
    id: 'p1', code: 'US 10,150,093 B2', short: '微结构反应器 · 蒸发冷却',
    patentee: 'INERATEC / KIT · 2018 授权', tag: '装置',
    views: [
      { id: 'stack', label: '叠层解剖', build: p1Stack },
      { id: 'field', label: '冷却场流道', build: p1Field },
      { id: 'dist', label: '分配器错流', build: p1Dist },
      { id: 'evap', label: '局部蒸干', build: p1Evap },
      { id: 'state', label: '等温性对比', panel: p1StatePanel }
    ]
  };

  /* ============================================================
     专利二 · US 2026/0077327 A1 — "spanked" 波形通道组件
     ============================================================ */
  const P2_W = 2.6, P2_TW = 1.2, P2_H0 = 6.5, P2_TH = 0.24;
  const P2_PITCH = P2_W + P2_TW;

  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  function waveCenterline(opt) {
    const n = opt.n, w = P2_W, tw = P2_TW, h0 = P2_H0;
    const press = opt.press || 0;
    const h = h0 * (1 - 0.10 * press);
    const spank = opt.spank;
    const SIGN = opt.signs || function () { return 1; };
    const samples = 7;
    const pts = [{ x: 0, y: P2_TH / 2 }];
    for (let i = 0; i < n; i++) {
      const xb = i * P2_PITCH;
      const amp = spank ? 0.55 : 0.62;
      const dU = yy => spank
        ? (0.62 * smooth(yy / h) + amp * press * Math.sin(Math.PI * yy / h))
        : 0.62 * press * Math.sin(Math.PI * yy / h) * SIGN(i * 2);
      const dD = yy => spank
        ? (0.62 * smooth(yy / h) + amp * press * Math.sin(Math.PI * yy / h))
        : 0.62 * press * Math.sin(Math.PI * yy / h) * SIGN(i * 2 + 1);
      for (let k = 0; k <= samples; k++) { const yy = (k / samples) * h; pts.push({ x: xb + dU(yy), y: yy }); }
      for (let k = samples; k >= 0; k--) { const yy = (k / samples) * h; pts.push({ x: xb + w + dD(yy), y: yy }); }
      pts.push({ x: xb + w + tw * 0.5, y: P2_TH / 2 });
    }
    return { pts: pts, h: h };
  }

  function ribbonOutline(center, thick) {
    const up = [], dn = [];
    for (let i = 0; i < center.length; i++) {
      const p = center[i];
      const a = center[Math.max(0, i - 1)], b2 = center[Math.min(center.length - 1, i + 1)];
      let nx = -(b2.y - a.y), ny = (b2.x - a.x);
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      up.push({ x: p.x + nx * thick / 2, y: p.y + ny * thick / 2 });
      dn.push({ x: p.x - nx * thick / 2, y: p.y - ny * thick / 2 });
    }
    return up.concat(dn.reverse());
  }

  function waveSheet(b, ox, oy, z0, z1, opt) {
    const cl = waveCenterline(opt);
    const ol = ribbonOutline(cl.pts, P2_TH).map(p => ({ x: p.x + ox, y: p.y + oy }));
    const base = opt.color || C.copper;
    b.extrude(ol, 'xy', z0, z1,
      s(base), opt.group,
      { capStyle: s(A.shade(base, 1.7)), backStyle: s(A.shade(base, 0.78)) });
    return cl.h;
  }

  function p2Assembly(b, ox, oy, oz, opt) {
    const grp = opt.group;
    const h = waveSheet(b, ox, oy, oz, oz + opt.len, {
      n: opt.n, press: opt.press, spank: opt.spank, signs: opt.signs, group: grp
    });
    const xw = opt.n * P2_PITCH;
    const yt = oy + h, yb = oy;
    const e = 0.25;
    b.box(ox - 1.5, ox + xw + 1.2, yt, yt + 1.0, oz - e, oz + opt.len + e, s(C.steelLt), grp);
    b.box(ox - 1.5, ox + xw + 1.2, yb - 1.0, yb, oz - e, oz + opt.len + e, s(C.steelLt), grp);
    if (opt.strips !== false) {
      const hs = h * 0.93;
      b.box(ox - 1.5, ox - 0.9, oy, oy + hs, oz, oz + opt.len, s(C.steel), grp);
      b.box(ox + xw + 0.6, ox + xw + 1.2, oy, oy + hs, oz, oz + opt.len, s(C.steel), grp);
    }
    return h;
  }

  function p2CompareAt(press) {
    const b = new A.Builder();
    b.group('conv', {});
    b.group('spank', {});
    const signs = i => (i % 2 === 0 ? 1 : -1);
    const N = 4;
    const oxL = -24, oxR = 4;
    const hL = p2Assembly(b, oxL, 0, -10, { n: N, press: press, spank: false, signs: signs, len: 20, group: 'conv' });
    const hR = p2Assembly(b, oxR, 0, -10, { n: N, press: press, spank: true, signs: signs, len: 20, group: 'spank' });
    for (let i = 0; i < N; i++) {
      A.arrowDown(b, oxL + (i + 0.5) * P2_PITCH, -10, hL + 5.8 - press * 1.6, 5.0, 2.6, C.red, 'conv');
      A.arrowDown(b, oxR + (i + 0.5) * P2_PITCH, -10, hR + 5.8 - press * 1.6, 5.0, 2.6, C.green, 'spank');
    }
    return { b: b, hL: hL, hR: hR, N: N, oxL: oxL, oxR: oxR };
  }

  function p2Compare() {
    const out = p2CompareAt(0);
    const b = out.b;
    const w = out.N * P2_PITCH;
    b.label([out.oxL + w / 2, -2, 9], '现有技术 FIG.2：壁面近垂直 → 屈曲方向不可控', { color: C.red, anchor: 'middle', dx: 0, dy: 52, group: 'conv' });
    b.label([out.oxR + w / 2, -2, 9], '本发明 FIG.1：峰谷侧移 → 两壁同向弓弯', { color: C.green, anchor: 'middle', dx: 0, dy: 52, group: 'spank' });
    b.label([out.oxL + w / 2, 8, -9], '截面被压扁 → 通道间流量不均', { color: C.red, anchor: 'middle', dx: 0, dy: -30, group: 'conv' });
    b.label([out.oxR + w / 2, 8, -9], '截面守恒，偏差 < ±20%，可压缩 10%', { color: C.green, anchor: 'middle', dx: 0, dy: -30, group: 'spank' });
    const sc = makeScene(b, { view: { yaw: -0.32, pitch: 0.18, zoom: 1.05 } });
    sc.tick = function (scene, time) {
      const p = 0.5 - 0.5 * Math.cos(time * 1.05);
      const rb = p2CompareAt(p).b;
      if (rb.items.length !== scene.items.length) return;
      for (let i = 0; i < rb.items.length; i++) scene.items[i].pts = rb.items[i].pts;
    };
    return sc;
  }

  /* ---- 视图 2：重复单元爆炸 ---- */
  function p2Unit() {
    const b = new A.Builder();
    b.group('plate5', { explode: [0, -14, 0] });
    b.group('sheet', {});
    b.group('plate4', { explode: [0, 18, 0] });
    b.group('posts', { explode: [0, 34, 0] });
    const z0 = -6.5, z1 = 6.5;
    const XW = 42;
    b.box(-XW / 2, XW / 2, -1.6, 0, z0 - 1, z1 + 1, s(C.steel), 'plate5');
    [-19, -5.7, 7.6].forEach(function (ox) {
      waveSheet(b, ox, 0, z0, z1, { n: 3, press: 0, spank: true, group: 'sheet' });
    });
    const hs = 6.05;
    [-19.6, -6.65, 6.65, 19.6].forEach(function (x, i) {
      const outer = (i === 0 || i === 3);
      b.box(x - 0.60, x + 0.60, 0, hs, z0, z1, s(outer ? C.steelDk : A.shade(C.steelDk, 0.86)), 'sheet');
    });
    b.box(-XW / 2, XW / 2, 7.5, 9.0, z0 - 1, z1 + 1, s(C.steel), 'plate4');
    [[-XW / 2 + 1.4, z0 - 0.6], [XW / 2 - 1.4, z0 - 0.6], [-XW / 2 + 1.4, z1 + 0.6], [XW / 2 - 1.4, z1 + 0.6]]
      .forEach(function (p) {
        b.box(p[0] - 1.0, p[0] + 1.0, -1.6, 9.0, p[1] - 1.0, p[1] + 1.0, s(C.amber), 'posts');
      });
    b.label([14, 8.6, z1], '4 隔板（不锈钢）', { color: C.steelLt, group: 'plate4', dx: 14, dy: -6 });
    b.label([12, 5.6, z1], '1 波形片（铜 150µm）', { color: C.copperLt, group: 'sheet', dx: 16 });
    b.label([19.6, 2.4, z1], '3 边条（低于波高）', { color: C.steelLt, group: 'sheet', dx: 16, dy: 8 });
    b.label([-6.65, 4.8, z0], '3 边条', { color: C.steelLt, group: 'sheet', dx: -16, anchor: 'end' });
    b.label([-XW / 2, -1.0, z0], '5 隔板', { color: C.steelLt, group: 'plate5', dx: -16, anchor: 'end' });
    b.label([XW / 2, 0.6, z1], '6 角柱（维持压缩）', { color: C.amber, group: 'posts', dx: 16 });
    return makeScene(b, { view: { yaw: -0.26, pitch: 0.30, zoom: 1.0, explode: 0.6 } });
  }

  /* ---- 视图 3：反应芯块 ---- */
  function p2Core() {
    const b = new A.Builder();
    const nPair = 3;
    const HALF = 9;
    const ZL = 11;
    for (let k = 0; k < nPair; k++) {
      const gProc = 'proc' + k, gHx = 'hx' + k;
      b.group(gProc, { explode: [0, (k - 1) * 7.5, 0] });
      b.group(gHx, { explode: [0, (k - 1) * 7.5 + 3.8, 0] });
      const y = k * 8.2;
      const cl = waveCenterline({ n: 4, press: 0, spank: true });
      const ol = ribbonOutline(cl.pts, P2_TH).map(p => ({ x: p.x - HALF, y: p.y + y }));
      b.extrude(ol, 'xy', -ZL, ZL, s(C.copper), gProc);
      for (let i = 0; i < 4; i++) {
        const xa = -HALF + i * P2_PITCH + 0.42;
        b.box(xa, xa + P2_W - 0.84, y + 0.5, y + cl.h - 0.5, -ZL + 0.6, ZL - 0.6,
          { fill: C.catalyst, alpha: 0.42, stroke: null }, gProc);
      }
      b.box(-HALF - 1.4, HALF + 1.4, y + cl.h, y + cl.h + 0.8, -ZL - 0.2, ZL + 0.2, s(C.steelLt), gProc);
      const yh = y + cl.h + 0.8;
      b.box(-HALF - 2.6, HALF + 2.6, yh, yh + 0.9, -ZL - 0.2, ZL + 0.2, s(C.steel), gHx);
      for (let i = 0; i < 8; i++) {
        const z = -ZL + 1.4 + i * 2.7;
        b.tube([P(-HALF - 2.6, yh + 0.45, z), P(HALF + 2.6, yh + 0.45, z)], 0.58, s(C.cyanDeep), gHx, 4);
      }
      b.box(-HALF - 2.6, HALF + 2.6, yh + 0.9, yh + 1.6, -ZL, ZL, glass(C.cyanLt, 0.12), gHx);
    }
    for (let i = 0; i < 4; i++) {
      const x = -HALF + i * P2_PITCH + P2_W / 2;
      b.flow([P(x, 3.2, -ZL - 1), P(x, 3.2, ZL + 1)], { count: 3, speed: 0.30, size: 2.3, color: C.amberHot, color2: C.violet, group: 'proc1' });
    }
    for (let i = 0; i < 8; i++) {
      const z = -ZL + 1.4 + i * 2.7;
      b.flow([P(-HALF - 3, 12.9, z), P(HALF + 3, 12.9, z)], { count: 2, speed: 0.22, size: 2.0, color: C.cyan, color2: C.steam, group: 'hx1' });
    }
    b.label([HALF + 2.6, 3, ZL], '310 工艺微通道 + 催化剂 500', { color: C.amberHot, dx: 18, group: 'proc1' });
    b.label([HALF + 2.6, 12.9, ZL], '355 换热通道（与工艺通道正交）', { color: C.cyanLt, dx: 18, group: 'hx1' });
    b.label([0, 24, -ZL], '220 反应芯块：工艺层 / 换热层交替层叠', { color: C.steelLt, anchor: 'middle', dx: 0, dy: -22, group: 'hx2' });
    return makeScene(b, { view: { yaw: -0.30, pitch: 0.42, zoom: 1.0, explode: 0.5 } });
  }

  /* ---- 视图 4：单元 → 芯块 → 压力容器 ---- */
  function p2Scale() {
    const b = new A.Builder();
    b.group('u', { explode: [-40, 0, 0] });
    b.group('c', {});
    b.group('v', { explode: [46, 0, 0] });
    const cl = waveCenterline({ n: 3, press: 0, spank: true });
    const ol = ribbonOutline(cl.pts, P2_TH).map(p => ({ x: p.x - 20, y: p.y + 3 }));
    b.extrude(ol, 'xy', -6, 6, s(C.copper), 'u');
    b.box(-21.5, -8.6, 3, 4.0, -6, 6, s(C.steelLt), 'u');
    b.box(-21.5, -8.6, 9.4, 10.4, -6, 6, s(C.steelLt), 'u');
    for (let k = 0; k < 4; k++) {
      const y = k * 4.4;
      const o2 = ribbonOutline(waveCenterline({ n: 3, press: 0, spank: true }).pts, P2_TH)
        .map(p => ({ x: p.x - 5, y: p.y * 0.48 + y }));
      b.extrude(o2, 'xy', -8, 8, s(C.copper), 'c');
      b.box(-6.6, 6.6, y, y + 0.7, -8, 8, s(C.steel), 'c');
      b.box(-7.6, 7.6, y + 3.1, y + 4.0, -8, 8, glass(C.cyanLt, 0.3), 'c');
    }
    const VX = 26;
    b.box(VX - 19, VX + 19, -2.5, 27, -12, 12, glass(C.steel, 0.08), 'v');
    for (let k = 0; k < 3; k++) {
      const cx = VX - 11 + k * 11;
      b.box(cx - 4.2, cx + 4.2, 2, 22.5, -6.5, 6.5, s(C.steelDk), 'v');
      b.box(cx - 4.6, cx + 4.6, 2.2, 22.3, -6.9, 6.9, glass(C.cyanLt, 0.12), 'v');
    }
    b.tube([P(VX - 22, 25, 0), P(VX - 8, 25, 0)], 1.6, s(C.amber), 'v', 5);
    b.tube([P(VX + 8, 25, 0), P(VX + 22, 25, 0)], 1.6, s(C.violet), 'v', 5);
    b.label([VX, 28, 0], '210 压力容器（可含 1–12 个 220）', { color: C.steelLt, anchor: 'middle', dx: 0, dy: -16, group: 'v' });
    b.label([VX - 22, 25, 0], '230 进气', { color: C.amber, anchor: 'end', dx: -8, group: 'v' });
    b.label([VX + 22, 25, 0], '230 出料', { color: C.violet, dx: 8, group: 'v' });
    b.label([-14, 1, 0], '300 层叠单元', { color: C.copperLt, anchor: 'middle', dx: 0, dy: 30, group: 'u' });
    b.label([0, 18, 0], '220 芯块', { color: C.copperLt, anchor: 'middle', dx: 0, dy: -18, group: 'c' });
    return makeScene(b, { view: { yaw: -0.46, pitch: 0.22, zoom: 1.0, explode: 0.6 } });
  }

  A.scenes.p2 = {
    id: 'p2', code: 'US 2026/0077327 A1', short: '波形通道组件 · 抗屈曲',
    patentee: 'Velocys Technologies · 2026 公开', tag: '构件',
    views: [
      { id: 'compare', label: '下压行为对比', build: p2Compare },
      { id: 'unit', label: '重复单元', build: p2Unit },
      { id: 'core', label: '反应芯块', build: p2Core },
      { id: 'scale', label: '单元→容器', build: p2Scale }
    ]
  };
})(window);
