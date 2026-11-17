/* ============================================================
   engine.js — 三维解剖渲染引擎（3D → SVG）
   纯 SVG 输出：每个面是一个 <polygon>，每条流道是 <polyline>，
   运动粒子是 <circle>。所有元素每帧重新投影，因此是"动态 SVG"。
   ============================================================ */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- 向量 ---------- */
  const V = {
    pt(x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; },
    add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
    sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
    mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
    dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
    cross(a, b) {
      return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
    },
    len(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); },
    norm(a) { const l = V.len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; },
    lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; }
  };

  /* ---------- 颜色 ---------- */
  function hexToRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(c) {
    const f = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + f(c.r) + f(c.g) + f(c.b);
  }
  /** 明暗：k>1 变亮，k<1 变暗 */
  function shade(hex, k) {
    const c = hexToRgb(hex);
    if (k >= 1) {
      const t = k - 1;
      return rgbToHex({ r: c.r + (255 - c.r) * t, g: c.g + (255 - c.g) * t, b: c.b + (255 - c.b) * t });
    }
    return rgbToHex({ r: c.r * k, g: c.g * k, b: c.b * k });
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
  }

  /* ---------- 光照 ---------- */
  const LIGHT = V.norm(V.pt(-0.42, 0.86, 0.52));

  /* ---------- 剪切平面 ---------- */
  function clipPoly(pts, plane) {
    const out = [];
    const n = pts.length;
    if (!n) return out;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const da = V.dot(plane.n, a) - plane.d;
      const db = V.dot(plane.n, b) - plane.d;
      if (da >= 0) out.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        out.push(V.lerp(a, b, da / (da - db)));
      }
    }
    return out;
  }
  function clipSegment(a, b, plane) {
    const da = V.dot(plane.n, a) - plane.d;
    const db = V.dot(plane.n, b) - plane.d;
    if (da < 0 && db < 0) return null;
    if (da >= 0 && db >= 0) return [a, b];
    const t = da / (da - db);
    const p = V.lerp(a, b, t);
    return da >= 0 ? [a, p] : [p, b];
  }

  /* ============================================================
     Builder
     ============================================================ */
  function Builder() {
    this.items = [];      // {kind, pts, style, group, normal}
    this.groups = {};     // name -> {dir:[x,y,z], amount}
    this.labels = [];
    this.flows = [];
    this._lastGroup = null;
  }

  Builder.prototype.group = function (name, opts) {
    opts = opts || {};
    const ex = opts.explode || [0, 0, 0];
    this.groups[name] = {
      name: name,
      dir: V.norm(V.pt(ex[0], ex[1], ex[2])),
      amount: Math.sqrt(ex[0] * ex[0] + ex[1] * ex[1] + ex[2] * ex[2]),
      color: opts.color || '#94a3b8',
      label: opts.label || name
    };
    this._lastGroup = name;
    return this;
  };

  Builder.prototype._style = function (style, normal) {
    const s = typeof style === 'string' ? { fill: style } : Object.assign({}, style);
    s.fill = s.fill || '#8fa3b8';
    const k = 0.62 + 0.52 * Math.abs(V.dot(normal, LIGHT));
    s.shaded = s.flat ? s.fill : shade(s.fill, k);
    s.stroke = s.stroke === null ? null : (s.stroke || shade(s.fill, 0.38));
    if (s.sw === undefined) s.sw = 0.55;
    if (s.alpha === undefined) s.alpha = 1;
    return s;
  };

  Builder.prototype.face = function (pts, style, group) {
    if (pts.length < 3) return this;
    const n = V.norm(V.cross(V.sub(pts[1], pts[0]), V.sub(pts[2], pts[0])));
    this.items.push({
      kind: 'face',
      pts: pts,
      style: this._style(style, n),
      group: group || this._lastGroup,
      normal: n
    });
    return this;
  };

  /** 轴对齐立方体 */
  Builder.prototype.box = function (x0, x1, y0, y1, z0, z1, style, group) {
    if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
    if (y0 > y1) { const t = y0; y0 = y1; y1 = t; }
    if (z0 > z1) { const t = z0; z0 = z1; z1 = t; }
    const P = V.pt;
    const c = [
      [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], // bottom
      [P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)], // top
      [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], // left  (-x)
      [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], // right (+x)
      [P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)], // back  (-z)
      [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]  // front (+z)
    ];
    for (let i = 0; i < 6; i++) this.face(c[i], style, group);
    return this;
  };

  Builder.prototype.boxC = function (cx, cy, cz, sx, sy, sz, style, group) {
    return this.box(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, style, group);
  };

  /** 二维轮廓沿坐标轴拉伸成体
   *  plane: 'xy' (拉伸 z) | 'xz' (拉伸 y，outline 的 y 当 z) | 'yz' (拉伸 x) */
  function outline3(outline, plane, a) {
    return outline.map(function (p) {
      if (plane === 'xy') return V.pt(p.x, p.y, a);
      if (plane === 'xz') return V.pt(p.x, a, p.y);
      return V.pt(a, p.x, p.y); // 'yz'
    });
  }

  Builder.prototype.extrude = function (outline, plane, a0, a1, style, group, opts) {
    opts = opts || {};
    const A1 = outline3(outline, plane, a1);
    const B1 = outline3(outline, plane, a0);
    this.face(A1, opts.capStyle || style, group);
    this.face(B1.slice().reverse(), opts.backStyle || style, group);
    const n = outline.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.face([A1[i], A1[j], B1[j], B1[i]], style, group);
    }
    return this;
  };

  Builder.prototype.line = function (pts, style, group) {
    const P = pts.map(function (p) { return Array.isArray(p) ? V.pt(p[0], p[1], p[2]) : p; });
    const s = typeof style === 'string' ? { stroke: style } : Object.assign({}, style);
    s.stroke = s.stroke || '#7dd3fc';
    if (s.sw === undefined) s.sw = 1.6;
    if (s.alpha === undefined) s.alpha = 1;
    s.cap = s.cap || 'round';
    this.items.push({ kind: 'line', pts: P, style: s, group: group || this._lastGroup });
    return this;
  };

  /** 一条"管道"：沿路径的细长六面体，用于一次性生成流道壁 */
  Builder.prototype.tube = function (pts, r, style, group, sides) {
    sides = sides || 4;
    if (pts.length < 2) return this;
    const rings = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let t;
      if (i === 0) t = V.norm(V.sub(pts[1], pts[0]));
      else if (i === pts.length - 1) t = V.norm(V.sub(pts[i], pts[i - 1]));
      else t = V.norm(V.sub(pts[i + 1], pts[i - 1]));
      let up = Math.abs(t.y) > 0.9 ? V.pt(1, 0, 0) : V.pt(0, 1, 0);
      const u = V.norm(V.cross(t, up));
      const w = V.norm(V.cross(t, u));
      const ring = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        ring.push(V.add(p, V.add(V.mul(u, Math.cos(a) * r), V.mul(w, Math.sin(a) * r))));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const s2 = (s + 1) % sides;
        this.face([rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s]], style, group);
      }
    }
    return this;
  };

  Builder.prototype.label = function (pos, text, opts) {
    opts = opts || {};
    this.labels.push({
      pos: V.pt(pos[0], pos[1], pos[2]),
      text: text,
      group: opts.group || this._lastGroup,
      color: opts.color || '#cbd5e1',
      dx: opts.dx || 0,
      dy: opts.dy || 0,
      anchor: opts.anchor || 'start',
      size: opts.size || 11,
      pin: opts.pin !== false
    });
    return this;
  };

  /** 流动粒子组 */
  Builder.prototype.flow = function (path, opts) {
    opts = opts || {};
    const P = path.map(function (p) {
      return Array.isArray(p) ? V.pt(p[0], p[1], p[2]) : p;
    });
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + V.len(V.sub(P[i], P[i - 1])));
    this.flows.push({
      pts: P,
      cum: cum,
      total: cum[cum.length - 1] || 1,
      count: opts.count || 6,
      speed: opts.speed === undefined ? 0.22 : opts.speed,
      size: opts.size || 3.2,
      color: opts.color || '#7dd3fc',
      color2: opts.color2 || null,
      opacity: opts.opacity === undefined ? 1 : opts.opacity,
      sizeFn: opts.sizeFn || null,
      group: opts.group || this._lastGroup
    });
    return this;
  };

  Builder.prototype.finish = function () {
    const b = { min: V.pt(1e9, 1e9, 1e9), max: V.pt(-1e9, -1e9, -1e9) };
    this.items.forEach(function (it) {
      it.pts.forEach(function (p) {
        if (p.x < b.min.x) b.min.x = p.x;
        if (p.y < b.min.y) b.min.y = p.y;
        if (p.z < b.min.z) b.min.z = p.z;
        if (p.x > b.max.x) b.max.x = p.x;
        if (p.y > b.max.y) b.max.y = p.y;
        if (p.z > b.max.z) b.max.z = p.z;
      });
    });
    return b;
  };

  /* ============================================================
     Viewer
     ============================================================ */
  function Viewer(host, opts) {
    opts = opts || {};
    this.host = host;
    this.yaw = opts.yaw === undefined ? -0.62 : opts.yaw;
    this.pitch = opts.pitch === undefined ? 0.38 : opts.pitch;
    this.zoom = 1;
    this.explodeT = 0;
    this.clipOn = false;
    this.clipPos = 0.5;
    this.clipAxis = 'z';
    this.play = true;
    this.time = 0;
    this.scene = null;
    this.onFrame = null;
    this._raf = null;
    this._dirty = true;
    this._build();
    this._bind();
  }

  Viewer.prototype._build = function () {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'viewport-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML =
      '<radialGradient id="bgGlow" cx="50%" cy="42%" r="62%">' +
      '<stop offset="0%" stop-color="#1b2740"/><stop offset="100%" stop-color="#0a0f1a"/>' +
      '</radialGradient>';
    svg.appendChild(defs);
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'url(#bgGlow)');
    svg.appendChild(bg);

    this.gSolid = document.createElementNS(NS, 'g');
    this.gFlow = document.createElementNS(NS, 'g');
    this.gLabel = document.createElementNS(NS, 'g');
    svg.appendChild(this.gSolid);
    svg.appendChild(this.gFlow);
    svg.appendChild(this.gLabel);

    this.host.appendChild(svg);
    this.svg = svg;
    this.pool = [];      // face/line elements
    this.flowPool = [];
    this.labelPool = [];
  };

  Viewer.prototype.setScene = function (scene) {
    this.scene = scene;
    this.baseBounds = scene.bounds;
    this._updateBounds();
    if (scene.view) {
      if (scene.view.yaw !== undefined) this.yaw = scene.view.yaw;
      if (scene.view.pitch !== undefined) this.pitch = scene.view.pitch;
      if (scene.view.zoom !== undefined) this.zoom = scene.view.zoom;
    }
    this._syncPools();
    this._sig = null;
    this._dirty = true;
  };

  /* 依当前爆炸程度计算有效包围盒，使模型始终充满视野 */
  Viewer.prototype._updateBounds = function () {
    const b = this.baseBounds;
    if (!b) return;
    const t = this.explodeT;
    const mn = { x: b.min.x, y: b.min.y, z: b.min.z };
    const mx = { x: b.max.x, y: b.max.y, z: b.max.z };
    if (t) {
      const gs = this.scene.groups;
      for (const k in gs) {
        const g = gs[k];
        if (!g.amount) continue;
        const dx = g.dir.x * g.amount * t, dy = g.dir.y * g.amount * t, dz = g.dir.z * g.amount * t;
        mn.x += Math.min(0, dx); mx.x += Math.max(0, dx);
        mn.y += Math.min(0, dy); mx.y += Math.max(0, dy);
        mn.z += Math.min(0, dz); mx.z += Math.max(0, dz);
      }
    }
    this.bounds = { min: mn, max: mx };
    this.center = { x: (mn.x + mx.x) / 2, y: (mn.y + mx.y) / 2, z: (mn.z + mx.z) / 2 };
  };

  Viewer.prototype._syncPools = function () {
    const s = this.scene;
    // 清理
    while (this.gSolid.firstChild) this.gSolid.removeChild(this.gSolid.firstChild);
    while (this.gFlow.firstChild) this.gFlow.removeChild(this.gFlow.firstChild);
    while (this.gLabel.firstChild) this.gLabel.removeChild(this.gLabel.firstChild);
    this.pool = [];
    this.flowPool = [];
    this.labelPool = [];
    if (!s) return;

    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      let el;
      if (it.kind === 'face') {
        el = document.createElementNS(NS, 'polygon');
        el.setAttribute('fill', it.style.shaded);
        el.setAttribute('fill-opacity', it.style.alpha);
        if (it.style.stroke) {
          el.setAttribute('stroke', it.style.stroke);
          el.setAttribute('stroke-width', it.style.sw);
          el.setAttribute('stroke-opacity', it.style.strokeAlpha === undefined ? 0.85 : it.style.strokeAlpha);
        }
        if (it.style.cssClass) el.setAttribute('class', it.style.cssClass);
      } else {
        el = document.createElementNS(NS, 'polyline');
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', it.style.stroke);
        el.setAttribute('stroke-width', it.style.sw);
        el.setAttribute('stroke-opacity', it.style.alpha);
        el.setAttribute('stroke-linecap', it.style.cap);
        el.setAttribute('stroke-linejoin', 'round');
        if (it.style.dash) el.setAttribute('stroke-dasharray', it.style.dash);
      }
      this.gSolid.appendChild(el);
      el._clipped = false;
      this.pool.push(el);
    }

    // 粒子
    const flows = s.flows || [];
    let n = 0;
    for (let i = 0; i < flows.length; i++) n += flows[i].count;
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', 2.4);
      this.gFlow.appendChild(c);
      this.flowPool.push(c);
    }

    // 标签
    const labels = s.labels || [];
    for (let i = 0; i < labels.length; i++) {
      const g = document.createElementNS(NS, 'g');
      const ln = document.createElementNS(NS, 'line');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', 3.2);
      dot.setAttribute('stroke', '#02060d');
      dot.setAttribute('stroke-width', '1.1');
      const tx = document.createElementNS(NS, 'text');
      tx.textContent = labels[i].text;
      tx.setAttribute('font-size', labels[i].size);
      tx.setAttribute('font-family', 'ui-monospace, "SFMono-Regular", Consolas, monospace');
      tx.setAttribute('fill', labels[i].color);
      tx.setAttribute('text-anchor', labels[i].anchor);
      tx.setAttribute('paint-order', 'stroke');
      tx.setAttribute('stroke', '#060a12');
      tx.setAttribute('stroke-width', '3');
      tx.setAttribute('stroke-opacity', '0.85');
      g.appendChild(ln);
      g.appendChild(dot);
      g.appendChild(tx);
      this.gLabel.appendChild(g);
      this.labelPool.push({ g: g, line: ln, dot: dot, text: tx, label: labels[i] });
    }
  };

  Viewer.prototype._bind = function () {
    const self = this;
    let dragging = false, lastX = 0, lastY = 0;
    const svg = this.svg;

    function down(e) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      svg.style.cursor = 'grabbing';
      if (e.pointerId !== undefined && svg.setPointerCapture) {
        try { svg.setPointerCapture(e.pointerId); } catch (err) { }
      }
    }
    function move(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      self.yaw += dx * 0.0075;
      self.pitch = Math.max(-1.35, Math.min(1.35, self.pitch + dy * 0.0065));
      self._dirty = true;
    }
    function up() { dragging = false; svg.style.cursor = 'grab'; }
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointerleave', up);
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.zoom = Math.max(0.45, Math.min(3.2, self.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      self._dirty = true;
    }, { passive: false });
    svg.style.cursor = 'grab';
    svg.style.touchAction = 'none';
  };

  Viewer.prototype.setExplode = function (t) {
    this.explodeT = t;
    this._updateBounds();
    this._dirty = true;
  };
  Viewer.prototype.setClip = function (on, axis, pos) {
    this.clipOn = on;
    if (axis) this.clipAxis = axis;
    if (pos !== undefined) this.clipPos = pos;
    this._dirty = true;
  };
  Viewer.prototype.resize = function () {
    const rect = this.svg.getBoundingClientRect();
    this._w = Math.max(320, Math.round(rect.width) || 800);
    this._h = Math.max(240, Math.round(rect.height) || 560);
    this.svg.setAttribute('viewBox', '0 0 ' + this._w + ' ' + this._h);
    this._sig = null;
    this._dirty = true;
  };

  /* 世界坐标 → 相机坐标（先平移到包围盒中心，再旋转） */
  Viewer.prototype._rot = function () {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const C0 = this.center || { x: 0, y: 0, z: 0 };
    return function (p) {
      const px = p.x - C0.x, py = p.y - C0.y, pz = p.z - C0.z;
      const x1 = px * cy + pz * sy;
      const z1 = -px * sy + pz * cy;
      const y1 = py;
      const y2 = y1 * cp - z1 * sp;
      const z2 = y1 * sp + z1 * cp;
      return { X: x1, Y: y2, Z: z2 };
    };
  };

  Viewer.prototype._projector = function (w, h, rot) {
    const b = this.bounds;
    let X0 = 1e9, X1 = -1e9, Y0 = 1e9, Y1 = -1e9, Z0 = 1e9, Z1 = -1e9;
    for (let i = 0; i < 8; i++) {
      const c = rot({
        x: (i & 1) ? b.max.x : b.min.x,
        y: (i & 2) ? b.max.y : b.min.y,
        z: (i & 4) ? b.max.z : b.min.z
      });
      if (c.X < X0) X0 = c.X; if (c.X > X1) X1 = c.X;
      if (c.Y < Y0) Y0 = c.Y; if (c.Y > Y1) Y1 = c.Y;
      if (c.Z < Z0) Z0 = c.Z; if (c.Z > Z1) Z1 = c.Z;
    }
    const wSpan = Math.max(X1 - X0, 0.001);
    const hSpan = Math.max(Y1 - Y0, 0.001);
    const dSpan = Math.max(Z1 - Z0, 0.001);
    const scale = Math.min(w / wSpan, h / hSpan) * 0.78 * this.zoom;
    const focus = Math.max(wSpan, hSpan, dSpan) * 2.9;
    const zMid = (Z0 + Z1) / 2;
    this._scale = scale;
    const cx = w / 2, cy = h / 2;
    return function (c) {
      const dz = c.Z - zMid;
      const persp = focus / Math.max(focus * 0.32, focus + dz);
      return { x: cx + c.X * scale * persp, y: cy - c.Y * scale * persp, s: persp, z: c.Z };
    };
  };

  Viewer.prototype._clipPlane = function () {
    if (!this.clipOn) return null;
    const b = this.baseBounds;
    const ax = this.clipAxis;
    const lo = b.min[ax], hi = b.max[ax];
    const v = lo + (hi - lo) * this.clipPos;
    const n = ax === 'x' ? V.pt(1, 0, 0) : ax === 'y' ? V.pt(0, 1, 0) : V.pt(0, 0, 1);
    return { n: n, d: v };
  };

  Viewer.prototype._groupOffset = function (gname) {
    const g = this.scene.groups[gname];
    if (!g || !this.explodeT) return null;
    const k = g.amount * this.explodeT;
    if (!k) return null;
    return V.mul(g.dir, k);
  };

  Viewer.prototype.render = function () {
    if (!this.scene) return;
    if (!this._w) {
      const rect = this.svg.getBoundingClientRect();
      this._w = Math.max(320, Math.round(rect.width) || 800);
      this._h = Math.max(240, Math.round(rect.height) || 560);
      this.svg.setAttribute('viewBox', '0 0 ' + this._w + ' ' + this._h);
    }
    const w = this._w, h = this._h;
    const rot = this._rot();
    const proj = this._projector(w, h, rot);
    const plane = this._clipPlane();
    const items = this.scene.items;
    const pool = this.pool;

    // 分组偏移缓存
    const offs = {};
    const off = (gname) => {
      if (offs[gname] === undefined) offs[gname] = this._groupOffset(gname);
      return offs[gname];
    };

    const order = [];
    const depths = [];
    const clipTint = '#ff9d5c';

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const o = off(it.group);
      let pts = it.pts;
      if (o) {
        pts = pts.map(p => ({ x: p.x + o.x, y: p.y + o.y, z: p.z + o.z }));
      }
      let clipped = false;
      if (plane) {
        const cp = clipPoly(pts, plane);
        if (cp.length < 3) { pool[i].style.display = 'none'; continue; }
        if (cp.length !== pts.length) clipped = true;
        pts = cp;
      }
      let zsum = 0;
      const scr = [];
      for (let j = 0; j < pts.length; j++) {
        const c = rot(pts[j]);
        const s = proj(c);
        scr.push(s.x, s.y);
        zsum += c.Z;
      }
      const el = pool[i];
      el.style.display = '';
      if (it.kind === 'face') {
        el.setAttribute('points', toPoints(scr));
        if (clipped !== el._clipped) {
          el._clipped = clipped;
          if (clipped && !it.style.noCutTint) {
            el.setAttribute('fill', clipTint);
            el.setAttribute('fill-opacity', Math.min(1, it.style.alpha));
            el.setAttribute('stroke', '#7c2d12');
          } else {
            el.setAttribute('fill', it.style.shaded);
            el.setAttribute('fill-opacity', it.style.alpha);
            if (it.style.stroke) el.setAttribute('stroke', it.style.stroke);
          }
        }
      } else {
        el.setAttribute('points', toPoints(scr));
      }
      order.push(i);
      depths.push(zsum / pts.length);
    }

    // 画家算法：远的先画（Z 大 = 远）
    const dmap = this._dmap || (this._dmap = new Float32Array(items.length));
    for (let i = 0; i < order.length; i++) dmap[order[i]] = depths[i];
    const sorted = order.sort((a, b) => dmap[b] - dmap[a]);

    // 仅在顺序变化时重排 DOM
    const sig = sorted.join(',');
    if (sig !== this._sig) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < sorted.length; i++) frag.appendChild(pool[sorted[i]]);
      this.gSolid.appendChild(frag);
      this._sig = sig;
    }

    // ---- 粒子 ----
    let pi = 0;
    const flows = this.scene.flows || [];
    const t = this.time;
    for (let f = 0; f < flows.length; f++) {
      const fl = flows[f];
      const o = off(fl.group);
      for (let k = 0; k < fl.count; k++) {
        const el = this.flowPool[pi++];
        if (!el) continue;
        let u = (t * fl.speed + k / fl.count) % 1;
        if (u < 0) u += 1;
        const p0 = pointAt(fl, u);
        const p = o ? { x: p0.x + o.x, y: p0.y + o.y, z: p0.z + o.z } : p0;
        if (plane && V.dot(plane.n, p) - plane.d < 0) { el.style.display = 'none'; continue; }
        const c = rot(p);
        const s = proj(c);
        el.style.display = '';
        el.setAttribute('cx', s.x.toFixed(2));
        el.setAttribute('cy', s.y.toFixed(2));
        const depthK = 0.85 + 0.35 * (s.s - 1);
        const r = (fl.sizeFn ? fl.sizeFn(u) : fl.size) * depthK * (this._scale / 6 + 0.55);
        el.setAttribute('r', Math.max(0.6, Math.min(9, r)).toFixed(2));
        el.setAttribute('fill', fl.color2 ? mix(fl.color, fl.color2, u) : fl.color);
        el.setAttribute('fill-opacity', (fl.opacity * (0.55 + 0.45 * Math.sin(Math.PI * u))).toFixed(3));
      }
    }

    // ---- 标签 ----
    for (let i = 0; i < this.labelPool.length; i++) {
      const L = this.labelPool[i];
      const lb = L.label;
      const o = off(lb.group);
      const p = o ? V.add(lb.pos, o) : lb.pos;
      const c = rot(p);
      const s = proj(c);
      const tx = s.x + lb.dx, ty = s.y + lb.dy;
      L.dot.setAttribute('cx', s.x.toFixed(1));
      L.dot.setAttribute('cy', s.y.toFixed(1));
      L.dot.setAttribute('fill', lb.color);
      L.dot.setAttribute('fill-opacity', '0.85');
      L.line.setAttribute('x1', s.x.toFixed(1));
      L.line.setAttribute('y1', s.y.toFixed(1));
      L.line.setAttribute('x2', tx.toFixed(1));
      L.line.setAttribute('y2', ty.toFixed(1));
      L.line.setAttribute('stroke', lb.color);
      L.line.setAttribute('stroke-width', '1.25');
      L.line.setAttribute('stroke-opacity', '0.82');
      L.line.setAttribute('stroke-dasharray', 'none');
      L.text.setAttribute('x', tx.toFixed(1));
      L.text.setAttribute('y', (ty + 3.5).toFixed(1));
    }
  };

  function toPoints(arr) {
    let s = '';
    for (let i = 0; i < arr.length; i += 2) {
      s += (i ? ' ' : '') + arr[i].toFixed(1) + ',' + arr[i + 1].toFixed(1);
    }
    return s;
  }

  function pointAt(fl, u) {
    const d = u * fl.total;
    const cum = fl.cum;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (d - cum[lo]) / seg;
    return V.lerp(fl.pts[lo], fl.pts[hi], t);
  }

  Viewer.prototype.start = function () {
    const self = this;
    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      if (self.play) self.time += dt;
      if (self.play || self._dirty) {
        self.render();
        self._dirty = false;
      }
      if (self.onFrame) self.onFrame(self.time);
      self._raf = requestAnimationFrame(frame);
    }
    this._raf = requestAnimationFrame(frame);
  };

  Viewer.prototype.stop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  /* ---------- 导出 ---------- */
  Viewer.prototype.exportSVG = function () {
    const clone = this.svg.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    clone.setAttribute('width', '1200');
    clone.setAttribute('height', '820');
    clone.setAttribute('viewBox', '0 0 1200 820');
    clone.style.background = '#0a0f1a';
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  };

  /* ---------- 导出 ---------- */
  global.Anatomy = {
    NS: NS,
    V: V,
    shade: shade,
    mix: mix,
    clipPoly: clipPoly,
    Builder: Builder,
    Viewer: Viewer,
    scenes: {}
  };
})(window);
