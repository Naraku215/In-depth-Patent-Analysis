/* ============================================================
   scenes.js — 每个专利的解剖视图（模板）
   ------------------------------------------------------------
   这是解剖台的"几何层"。每个视图是一个 build() 函数（**不带参数**），
   函数里自己 new 一个 Builder，画完 return makeScene(b)。

     const b = new A.Builder();
     b.group(name, {explode:[dx,dy,dz]})   注册一个可爆炸的组
     b.box(x0,x1,y0,y1,z0,z1, style, group) 轴对齐实体
     b.line([p...], {stroke,sw,alpha,dash}, group) 折线
     b.tube([p...], r, style, group, seg)   管线
     b.flow([p...], {count,speed,size,color,group}) 流动粒子
     b.label([x,y,z], '文字', {color,dx,dy,anchor,group})
     return makeScene(b, {view:{}, tick:function(t){...}})

   坐标：+x 向右、+y 向里（深度）、+z 向上。1 单位 ≈ 1 mm，按需缩放。
   ============================================================ */
(function (g) {
  'use strict';
  const A = g.Anatomy, V = A.V, C = A.C, s = A.s, glass = A.glass;
  const P = (x, y, z) => V.pt(x, y, z);

  function makeScene(b, opt) {
    opt = opt || {};
    return {
      items: b.items,
      groups: b.groups,
      labels: b.labels,
      flows: b.flows,
      bounds: b.finish(),
      view: opt.view || {},
      tick: opt.tick || null
    };
  }

  /* ------------------------------------------------------------
     示例视图：底座 + 可爆炸拉开的部件 + 一条流向
     正式解析时整段替换成专利的真实结构。
     ------------------------------------------------------------ */
  function demoView() {
    const b = new A.Builder();
    b.group('base', { explode: [0, 0, 0] });
    b.group('core', { explode: [0, 16, 0] });

    // 底座
    b.box(-40, 40, -24, 24, -6, 0, s(C.steelDk), 'base');
    // 核心部件（外壳 + 内腔）
    b.box(-28, 28, -16, 16, 4, 14, glass(C.steelLt, 0.35), 'core');
    b.box(-24, 24, -12, 12, 6, 12, glass(C.cyanLt, 0.18), 'core');

    // 流向：从左侧进、右侧出（折线端点落在部件边界上，不留悬空线头）
    b.flow([P(-46, 0, 6), P(-28, 0, 9), P(28, 0, 9), P(46, 0, 6)],
      { count: 12, speed: 0.3, size: 2.2, color: C.amber, group: 'core' });

    b.label([0, 0, 22], '① 核心部件（可拆）', { color: C.steelLt, group: 'core' });
    b.label([0, 0, -12], '② 底座', { color: C.steel, group: 'base' });

    return makeScene(b, {
      view: { yaw: -0.62, pitch: 0.52, zoom: 0.82 },
      tick: function (t) { /* 每帧回调：在这里改动态件 */ }
    });
  }

  /* ---------------- 注册 ---------------- */
  A.scenes.p1 = {
    id: 'p1',
    code: '{{PATENT_NO}}',
    short: '{{SHORT_TITLE}}',
    patentee: '{{ASSIGNEE}}',
    tag: '{{TYPE}}',
    views: [
      { id: 'demo', label: '结构总览', build: demoView }
    ]
  };
})(window);
