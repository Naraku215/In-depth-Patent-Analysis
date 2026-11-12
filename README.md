# 专利解析 Agent

把一个专利文件夹，变成**一个可以点着看的 `index.html`**：三维解剖台、工程图鉴、深度解读，三样按这件专利适不适合来决定出几样。

用于绿氢 / 燃料电池这类**系统、装置、流程、反应器**专利——目标是让人在半小时内看懂一件本来要读两天的专利。

---

## 用起来就三步

**1. 克隆到本地，用你的 agent 客户端打开这个文件夹**

Codex、Claude Code、Work Buddy、Cursor 之类，只要是能读 `AGENTS.md`、能跑命令的客户端都行。

**2. 把你的专利放进去**

```
patents/
└── 你的专利名/           ← 目录名随意
    ├── full.md            ← 专利全文（要含权利要求书）
    └── images/            ← full.md 里 ![](images/xxx.jpg) 引用的图
```

**3. 在对话里说一句**

> 解析一下 US 10,150,093 B2

它会自己跑：读专利 → 判断这件专利该出哪几种产物 → 画图 → 建解剖台 → 写文档 → 自检。跑完给你一个 `out/<id>/index.html`，双击就开。

> 想知道进度：说「状态」，或者 `node bin/patent.mjs status`。

---

## 会得到什么

一个 `index.html`，里面是 1–3 张卡片：

| 产出 | 什么时候有 | 是什么 |
|---|---|---|
| **专利解剖台** | 有明确三维结构（反应器、电堆、测试台、装配体） | 按专利尺寸搭的三维模型，可旋转、爆炸分解、剖切 |
| **专利结构动态演算图鉴** | 有可以画成一台机器的原理（受压、流动、装配、工艺步骤） | 等轴测工程图，指针一动读数就变 |
| **深度解析** | **每件都有** | 固定模板：结论、结构、原理、工艺、数据、权项、证据边界、假设与简化 |

**不适合的不硬做。** 纯方法、纯配方、纯参数型专利，可能只出文档——这比画一张似是而非的机器图有用。

---

## 它凭什么可信

这个项目唯一的硬要求是：**不能把专利理解歪**。

- 产出里每个数字、每个部件标号、每处「权项 N」、每处段号，都要能在 `full.md` 里查到；
- 查不到的，必须写明「这是模型值 / 这是假设」，并说明依据；
- 假设必须符合学科常识（泵就是泵、换热器就是换热器），不能为了画面好看编结构；
- 专利没证明的事，写进「证据边界」，不替它圆。

这些不是事后检查，是**生成时的门禁**：`build` 跑完自动校验，`package` 之前再校验一次，**不过就不出包**。

---

## 手动跑（不想让 agent 代劳时）

```bash
node bin/patent.mjs doctor        # 环境自检
node bin/patent.mjs list          # 看看有哪些专利
node bin/patent.mjs extract       # full.md → facts.json
node bin/patent.mjs facts         # 读权项与标号表
#   ↓ 这一步写 1~3 个文件（见 work/<id>/）
node bin/patent.mjs build
node bin/patent.mjs verify
node bin/patent.mjs package
```

无第三方依赖，不用 `npm install`。`verify` 需要本机有 Chrome / Chromium。

---

## 目录

```
AGENTS.md          agent 作业手册（读这个就知道怎么干活）
SKILL.md           给支持 skill 的客户端用的入口卡
patents/           你把专利放这里
out/               解析结果（gitignored）
work/              中间产物（gitignored）
bin/patent.mjs     命令行
lib/               解析 / 校验 / 渲染 / 打包
prompts/           六个阶段的提示词
templates/         解剖台站点、图脚本、文档模板
skills/anatomy/    vendored 的 anatomy 制图技能（MIT）
examples/          一个虚构专利的完整样例
docs/              方法论与质检清单（维护者看）
```

---

## 环境

- Node.js ≥ 20.10
- Chrome / Chromium（仅 `verify` 与缩略图需要）

## License

MIT。`skills/anatomy/` 为 [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) 的 vendored 副本，遵循原 MIT 许可。
