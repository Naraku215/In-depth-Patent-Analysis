# anatomy · vendored 副本

上游：https://github.com/wheresryan22/anatomy （MIT）
取用：2026-11-13，自本机 agent 的 skill 目录快照；上游未提供 commit 号，改用下面的哈希指纹核对。

## 为什么直接放进仓库，而不是当依赖装

1. **skill 没有包管理器产物**——它不是一个 npm 包，"装依赖"只能靠脚本去 clone 一个仓库：要联网、离线就废、上游一改就漂。
2. **图纸代码是照着这版 kit 的 API 写的**。iso-kit.mjs 的导出变了，	emplates/figure/*.mjs 会静默画错。锁定副本 = 可复现。
3. 本项目是 **clone 即用**，没有构建步骤可以挂 postinstall。

## 裁剪了什么

只保留项目真正调用的部分（原 1.3 MB → 217 KB）：

| 保留 | 用途 |
|---|---|
| `kit/iso-kit.mjs` | 几何工具：slabOf / cylinder / pathOf / figureSvg / plateHtml / pageHtml |
| `scripts/inline-kit.mjs` | 把 kit 内联进生成的 html |
| `scripts/capture.mjs` + `chrome-port.mjs` | headless 截图（缩略图、渲染检查） |
| `scripts/lines.mjs` + `drive.mjs` + `line-ends.mjs` | 悬空线端检查 |
| `SKILL.md` + `references/craft.md` + `references/verify.md` | agent 画图前要读的手法和自检 |
| `LICENSE` | 上游 MIT 许可，必须随副本保留 |

去掉：`examples/`（含 PDF，体积主体）、`kit/` 里未用的 lathe/tube/turn/gl/audit/canvas-painter、`scripts/` 里的测试文件与 print/publish。

## 升级方法

把上游新版本解到临时目录，按上表重新拷贝，然后：

```
node bin/patent.mjs doctor     # 检查必需文件是否齐
node test/run.mjs              # 跑一遍图与解剖台，确认 API 没变
```

如果 `iso-kit.mjs` 的 API 变了，`templates/figure/*.mjs` 与 `test/fixtures/authoring/fig-01.mjs` 需要跟着改。

## 文件指纹

| 文件 | 大小 | sha256（前 16 位） |
|---|---|---|
| `kit/iso-kit.mjs` | 34 KB | `6d3ecc725d30c3b0` |
| `LICENSE` | 1 KB | `87c078ab9d90a304` |
| `references/craft.md` | 49 KB | `38761fa9b81d66b3` |
| `references/verify.md` | 43 KB | `fb81437fc5d75094` |
| `scripts/capture.mjs` | 15 KB | `12e901efe79df750` |
| `scripts/chrome-port.mjs` | 1 KB | `6775d3d389d26f37` |
| `scripts/drive.mjs` | 23 KB | `49c22499827a2a5e` |
| `scripts/inline-kit.mjs` | 1 KB | `01e08df7c2556ce5` |
| `scripts/line-ends.mjs` | 16 KB | `da79cc624c5bda0c` |
| `scripts/lines.mjs` | 2 KB | `b0ca73ab3a0d1cd4` |
| `SKILL.md` | 33 KB | `3423ada45a05033b` |