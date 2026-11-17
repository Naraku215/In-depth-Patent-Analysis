/* ============================================================
   app.js — 界面装配与交互
   ============================================================ */
(function () {
  'use strict';
  const A = window.Anatomy;
  const $ = id => document.getElementById(id);

  /* 单专利模板：专利清单由 scenes.js 里注册的 key 决定，顺序即 Object.keys 顺序 */
  const ORDER = Object.keys(A.scenes);
  let curPatent = 'p1';
  let curView = 0;

  /* 深链接：#p2/3 → 专利二第 3 个视图 */
  function readHash() {
    try {
      const m = /^#([a-z0-9]+)(?:\/(\d+))?$/i.exec(location.hash || '');
      if (!m) return false;
      if (!A.scenes[m[1]]) return false;
      curPatent = m[1];
      const n = A.scenes[m[1]].views.length;
      curView = Math.min(Math.max((parseInt(m[2], 10) || 1) - 1, 0), n - 1);
      return true;
    } catch (e) { return false; }
  }
  function writeHash() {
    try { history.replaceState(null, '', '#' + curPatent + '/' + (curView + 1)); } catch (e) { }
  }
  readHash();

  const viewer = new A.Viewer($('viewport'), {});
  viewer.start();

  /* ---------------- 左栏 ---------------- */
  function buildRail() {
    const rail = $('rail');
    rail.innerHTML = '';
    const g1 = document.createElement('div');
    g1.className = 'rail-group-label';
    g1.textContent = '专利清单';
    rail.appendChild(g1);
    ORDER.forEach(function (id) {
      const p = A.scenes[id];
      if (!p) return;
      const b = document.createElement('button');
      b.className = 'rail-item' + (id === curPatent ? ' on' : '');
      b.dataset.id = id;
      b.innerHTML = '<span class="rc">' + p.code + '</span>' +
        '<span class="rs">' + p.short + '</span>' +
        '<span class="rp">' + (p.patentee || '') + '</span>';
      b.onclick = () => selectPatent(id);
      rail.appendChild(b);
    });
  }

  /* ---------------- 元信息 ---------------- */
  function buildMeta() {
    const p = A.scenes[curPatent];
    const info = (A.patents && A.patents[curPatent]) || {};
    const cls = p.tag === '装置' ? 'dev' : p.tag === '工艺' ? 'proc' : 'comp';
    const nums = (info.facts || []).map(f => '<div>' + f[0] + ' <b>' + f[1] + '</b></div>').join('');
    $('meta').innerHTML =
      '<div class="meta-top">' +
      '<h2>' + (info.title || p.short) + '</h2>' +
      '<span class="pill">' + p.code + '</span>' +
      '<span class="pill ' + cls + '">' + (p.tag || '') + '</span>' +
      '<span class="pill">' + (p.patentee || '') + '</span>' +
      '</div>' +
      '<p>' + (info.abstract || '') + '</p>' +
      (nums ? '<div class="nums">' + nums + '</div>' : '');
    document.title = '专利解剖台 · ' + (info.title || p.short);
  }

  /* ---------------- 视图标签 ---------------- */
  function buildTabs() {
    const p = A.scenes[curPatent];
    const tabs = $('tabs');
    tabs.innerHTML = '';
    p.views.forEach(function (v, i) {
      const b = document.createElement('button');
      b.className = 'tab' + (i === curView ? ' on' : '');
      b.textContent = (i + 1) + '. ' + v.label;
      b.onclick = () => selectView(i);
      tabs.appendChild(b);
    });
  }

  /* ---------------- 切换 ---------------- */
  function selectPatent(id) {
    if (!A.scenes[id]) return;
    curPatent = id;
    curView = 0;
    document.querySelectorAll('.rail-item').forEach(function (el) {
      el.classList.toggle('on', el.dataset.id === id);
    });
    buildMeta();
    buildTabs();
    selectView(0);
  }

  function selectView(i, keepHash) {
    const p = A.scenes[curPatent];
    if (!p || !p.views[i]) return;
    curView = i;
    const v = p.views[i];
    document.querySelectorAll('.tab').forEach(function (el, k) {
      el.classList.toggle('on', k === i);
    });
    stopTick();
    if (v.panel) {
      viewer.svg.style.display = 'none';
      $('panelHost').classList.remove('hidden');
      $('panelHost').innerHTML = v.panel();
      $('controls').style.display = 'none';
      $('hint').style.display = 'none';
    } else {
      viewer.svg.style.display = '';
      $('panelHost').classList.add('hidden');
      $('panelHost').innerHTML = '';
      $('controls').style.display = '';
      $('hint').style.display = '';
      const sc = v.build();
      if (v.init) v.init(sc);
      viewer.setScene(sc);
      startTick(sc);
      const ex = sc.view && sc.view.explode !== undefined ? sc.view.explode : 0;
      $('explode').value = Math.round(ex * 100);
      viewer.setExplode(ex);
      $('explodeVal').textContent = Math.round(ex * 100) + '%';
      $('clipOn').checked = false;
      viewer.setClip(false);
      $('clipPos').value = 50;
      viewer.setClipPos && viewer.setClipPos(50);
    }
    $('viewBadge').innerHTML = p.code + '<br>' + (i + 1) + ' / ' + p.views.length + ' · ' + v.label;
    renderAside(v);
    if (!keepHash) writeHash();
  }

  let tickScene = null;
  function startTick(sc) { tickScene = sc; }
  function stopTick() { tickScene = null; }

  /* ---------------- 右栏解读 ---------------- */
  function esc(t) { return String(t); }
  function renderAside(v) {
    const key = curPatent + ':' + v.id;
    const n = (A.notes && A.notes[key]) || {};
    const pat = (A.patents && A.patents[curPatent]) || {};
    let html = '';
    if (n.key) html += '<div class="keybox">' + n.key + '</div>';
    html += '<h3>' + (n.title || v.label) + '</h3>';
    (n.body || []).forEach(function (t) { html += '<p>' + t + '</p>'; });
    if (n.steps && n.steps.length) {
      html += '<ol>' + n.steps.map(t => '<li>' + t + '</li>').join('') + '</ol>';
    }
    if (n.after) html += '<p>' + n.after + '</p>';
    if (n.parts && n.parts.length) {
      html += '<div class="parts"><h3 style="font-size:12px;margin-bottom:8px">部件标号对照</h3><table>' +
        n.parts.map(p => '<tr><td>' + esc(p[0]) + '</td><td>' + esc(p[1]) + '</td></tr>').join('') +
        '</table></div>';
    }
    if (n.tags) {
      html += '<div class="tagrow" style="margin-top:12px">' + n.tags.map(t => '<span>' + t + '</span>').join('') + '</div>';
    }
    if (pat.claim) {
      html += '<div class="parts"><h3 style="font-size:12px;margin-bottom:8px">独立权利要求要点</h3><p style="font-size:12px">' + pat.claim + '</p></div>';
    }
    $('asideBody').innerHTML = html;
    $('asideBody').scrollTop = 0;
  }

  /* ---------------- 控件 ---------------- */
  $('explode').addEventListener('input', function () {
    const t = (this.value | 0) / 100;
    viewer.setExplode(t);
    $('explodeVal').textContent = this.value + '%';
  });
  $('clipOn').addEventListener('change', function () {
    viewer.setClip(this.checked, $('clipAxis').value, ($('clipPos').value | 0) / 100);
  });
  $('clipPos').addEventListener('input', function () {
    if ($('clipOn').checked) viewer.setClip(true, $('clipAxis').value, (this.value | 0) / 100);
  });
  $('clipAxis').addEventListener('change', function () {
    if ($('clipOn').checked) viewer.setClip(true, this.value, ($('clipPos').value | 0) / 100);
  });
  $('btnPlay').addEventListener('click', function () {
    viewer.play = !viewer.play;
    this.textContent = viewer.play ? '暂停' : '播放';
    this.classList.toggle('active', !viewer.play);
  });
  $('btnReset').addEventListener('click', function () {
    viewer.yaw = viewer.scene && viewer.scene.view.yaw !== undefined ? viewer.scene.view.yaw : -0.62;
    viewer.pitch = viewer.scene && viewer.scene.view.pitch !== undefined ? viewer.scene.view.pitch : 0.38;
    viewer.zoom = viewer.scene && viewer.scene.view.zoom !== undefined ? viewer.scene.view.zoom : 1;
    viewer._dirty = true;
  });
  $('btnExport').addEventListener('click', function () {
    const svg = viewer.exportSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = curPatent + '-' + A.scenes[curPatent].views[curView].id + '.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  $('btnHelp').onclick = () => $('helpModal').classList.add('on');
  $('btnHelpClose').onclick = () => $('helpModal').classList.remove('on');
  $('helpModal').onclick = e => { if (e.target.id === 'helpModal') e.target.classList.remove('on'); };

  /* 每帧驱动 scene.tick（如波形下压动画） */
  viewer.onFrame = function (t) {
    if (tickScene && tickScene.tick && viewer.play) {
      tickScene.tick(tickScene, t);
      viewer._dirty = true;
    }
  };

  /* 图例 */
  function buildLegend() {
    const items = [
      ['#f5a03c', '反应介质 / 高温'],
      ['#38bdf8', '冷却剂 / 液态'],
      ['#e6f7ff', '蒸汽 / 气相'],
      ['#a78bfa', '产物 / 长链烃'],
      ['#bf6f3c', '铜波形片'],
      ['#94a3b8', '不锈钢结构件']
    ];
    $('legend').innerHTML = items.map(i => '<span><i style="background:' + i[0] + '"></i>' + i[1] + '</span>').join('');
  }

  /* ---------------- 语义验收入口 ---------------- */
  window.__anatomyAudit = {
    async collect() {
      const p = A.scenes[curPatent];
      if (!p) return [];
      const views = [];
      for (let i = 0; i < p.views.length; i++) {
        selectView(i, true);
        await new Promise(function (r) { setTimeout(r, 180); });
        const viewport = $('viewport');
        const vr = viewport.getBoundingClientRect();
        const svg = viewport.querySelector('svg');
        const texts = svg ? Array.from(svg.querySelectorAll('text')) : [];
        const labelled = texts.filter(function (el) { return /^\d/.test((el.textContent || '').trim()); });
        const labels = labelled.map(function (el) { return el.textContent.trim(); });
        const boxes = labelled.map(function (el) {
          const r = el.getBoundingClientRect();
          return { text: el.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height };
        });
        const parts = Array.from(document.querySelectorAll('#asideBody .parts table tr td:first-child'))
          .map(function (el) { return (el.textContent || '').trim(); })
          .filter(function (t) { return /^\d/.test(t); });
        views.push({ id: p.views[i].id, label: p.views[i].label, labels: labels, parts: parts, boxes: boxes, viewport: { x: vr.x, y: vr.y, w: vr.width, h: vr.height } });
      }
      return views;
    }
  };

  /* ---------------- 启动 ---------------- */
  buildRail();
  buildMeta();
  buildTabs();
  buildLegend();
  document.querySelectorAll('.rail-item').forEach(function (el) {
    el.classList.toggle('on', el.dataset.id === curPatent);
  });

  let totalViews = 0, totalParts = 0;
  ORDER.forEach(function (id) {
    const p = A.scenes[id];
    if (!p) return;
    totalViews += p.views.length;
    p.views.forEach(function (v) {
      const n = A.notes && A.notes[id + ':' + v.id];
      if (n && n.parts) totalParts += n.parts.length;
    });
  });
  $('statPatents').textContent = ORDER.filter(id => /^p\d$/.test(id) && A.scenes[id]).length;
  $('statViews').textContent = totalViews;
  $('statParts').textContent = totalParts;

  window.addEventListener('resize', function () { viewer.resize(); });
  window.addEventListener('hashchange', function () {
    const before = curPatent + '/' + curView;
    if (readHash() && (curPatent + '/' + curView) !== before) {
      document.querySelectorAll('.rail-item').forEach(function (el) {
        el.classList.toggle('on', el.dataset.id === curPatent);
      });
      buildMeta();
      buildTabs();
      selectView(curView, true);
    }
  });
  setTimeout(function () { viewer.resize(); selectView(curView, true); }, 60);
})();
