---
name: patent-anatomy
description: 把一件专利解析成三件产出并打成一个页面：三维「专利解剖台」（可旋转/爆炸/剖切）、anatomy 等轴测「专利结构动态演算图鉴」、以及固定模板的「深度解析文档」。当用户说"解析这个专利""剖析一下这篇专利""把专利做成图""专利解剖"，或给出一个只含 full.md 与 images/ 的专利目录时使用。
license: MIT
---

# 专利解析

一件专利 → 一个 `out/<id>/index.html`，里面是三部分：解剖台 / 图鉴 / 文档。

## 什么时候用

- 用户要把一件专利（`full.md` + `images/`）变成可读、可看、可验证的解析；
- 用户说「解析 XX 专利」「剖析这篇」「做成图」「解剖一下」；
- 用户已有解析、要改其中某一部分（图 / 解剖台 / 文档）。

**一次只处理一件专利。** 用户给多件时，先问解析哪一件，或一次处理一件。

## 怎么跑

在仓库根目录：

```bash
node bin/patent.mjs doctor                 # 环境自检
node bin/patent.mjs list                   # 确认输入
node bin/patent.mjs extract                # full.md → facts.json
node bin/patent.mjs facts                  # 读权项与标号表
#  · 写 work/<id>/build/fig-*.mjs         （图鉴，先加载 anatomy 技能）
#  · 写 work/<id>/station/js/scenes.js     （解剖台几何）
#  · 写 work/<id>/station/js/report.js     （解剖台解读）
#  · 写 work/<id>/doc.md                   （按模板）
node bin/patent.mjs build                   # 出三部分 + 内部校验
node bin/patent.mjs verify                  # 悬空线端 + headless 渲染
node bin/patent.mjs package                 # 过校验后出 index.html
```

## 三条硬规矩

1. **数字必须有出处**：专利没有的数值，只能出现在标了「读数说明 / 模型 / 换算」的段落里。
2. **标号必须真实**：部件表里的编号要能在 `facts.numerals` 里找到；没有标号的部件用描述，不许自编。
3. **不编证据**：专利没证明的事写进文档「证据边界」，不替它圆。

这三条由 `check` 在 `build` 与 `package` 两处强制执行，不过就不出包。

## 详细说明

作业手册见仓库根目录 `AGENTS.md`；六阶段提示词在 `prompts/`；
方法论与质检清单在 `docs/METHOD.md`、`docs/QUALITY.md`。
