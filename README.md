# 专利解析 Agent

一件专利 → **一个 `index.html`**。里面是三部分：

| 标签 | 是什么 |
|---|---|
| 01 专利解剖台 | 三维交互：拖动旋转、爆炸分解、可移动剖切面，右侧逐视图解读 + 部件标号表 |
| 02 专利结构动态演算图鉴 | 用 [anatomy](https://github.com/wheresryan22/anatomy) 技能生成的等轴测工程图组，带实时读数 |
| 03 深度解析 | 固定模板的文档：结论 / 结构 / 原理 / 工艺 / 数据 / 权项 / 证据边界 / 数值出处 |

交付目录里只有 `index.html` 要打开，三部分另存于 `_parts/` 可单独分发。

## 用法

把一件专利放进去：

```
patents/<任意名>/
├── full.md        ← 专利全文（含权利要求书）
└── images/        ← full.md 里 ![](images/x.jpg) 引用的图
```

在 agent 里说一句「**解析这个专利**」，它跑完整个流程。

手动跑：

```bash
node bin/patent.mjs doctor
node bin/patent.mjs list
node bin/patent.mjs extract      # full.md → facts.json
node bin/patent.mjs facts        # 看权项与标号表
#   ↓ 写三个文件：build/fig-*.mjs、station/js/scenes.js、station/js/report.js、doc.md
node bin/patent.mjs build        # 出三部分，并自动跑一次内部校验
node bin/patent.mjs verify       # 悬空线端 0 + headless console clean
node bin/patent.mjs package      # 校验通过才出 index.html
```

## 一次只解析一件

不做批量、不做专利群横向对比。批量会让每件都变浅，单件才有厚度。
输入目录里有多件时命令必须带 id；只有一件时可省略。

## 校验是规矩，不是事后审计

`build` 结束和 `package` 之前各跑一次**内部校验**，不通过就不出包。
交付里**没有审计文件**——规矩在生成时就成立：

| 规矩 | 检查 |
|---|---|
| 数字要有出处 | 产出里的数字能否在 `full.md` 里检索到；找不到的必须在标了「读数说明/模型/换算」的段落里 |
| 标号要真实 | 部件编号必须来自专利的标号表，不许自编 |
| 权项要对上 | 「权项 N」不超过权利要求总数 |
| 段号要对上 | 「[0013]」必须真实存在 |
| 不许留占位 | `{{…}}` 全部替换 |
| 文字不能坏 | 无重复汉字损坏 |
| 图要立得住 | 悬空线端 0、console clean |

需要看明细时用 `node bin/patent.mjs check`（只在终端打印，不写交付文件）。

## 文档是固定模板

`templates/doc/skeleton.md` 定义了八个正文章节 + 两个附录，顺序固定。
「阅读约定」原样保留在文档开头，说明哪些是专利原文、哪些是分析、哪些是模型值。
未填的 `{{…}}` 会被校验拦下。

## 目录

```
AGENTS.md              agent 作业手册（触发词、流程、门规）
SKILL.md               技能入口卡（给支持 skill 的 harness 用）
bin/patent.mjs         CLI
lib/                   解析 / 校验 / 渲染 / 打包
prompts/               六阶段提示词
templates/             解剖台站点、图脚本、文档模板
skills/anatomy/        vendored anatomy 技能（MIT）
docs/METHOD.md         方法论：为什么是这个结构
docs/QUALITY.md        质检清单（源自一次 14 项返工）
patents/               输入
work/                  工作区（gitignored）
out/                   交付（gitignored）
```

## 环境

Node.js ≥ 20.10；`verify` 需要 Chrome / Chromium。无第三方依赖，不用 `npm install`。

## License

MIT。`skills/anatomy/` 为 [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) 的 vendored 副本，遵循原 MIT 许可。
