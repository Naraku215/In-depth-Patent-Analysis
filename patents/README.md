# 输入目录

每件专利一个子目录，**只放两样东西**：

```
patents/
└── US_10150093_B2/          ← 目录名随意，系统归一成 id
    ├── full.md              ← 专利全文
    └── images/              ← full.md 里 ![](images/xxx.jpg) 引用的图
```

就这两样。**别把 PDF 解析工具的其他中间产物放进来。**

## 那些中间产物是什么

从 PDF 抽全文的工具（MinerU / PaddleOCR 之类）通常会吐出：

| 文件 | 是什么 | 要不要 |
|---|---|---|
| `full.md` | 正文 + 图片引用 | **要** |
| `images/` | 抽出来的图 | **要** |
| `layout.json`（1–3 MB） | 版面框坐标 | 不要 |
| `*_model.json`（0.2–1 MB） | 模型原始输出 | 不要 |
| `*_content_list.json` / `_v2` | 结构化内容块 | 不要 |
| `block_list.json` | 文本块 | 不要 |
| `*_origin.pdf`（0.3–3 MB） | 原始 PDF | 不要 |

后面这些是解析器的中间件，系统一个都不读。放进来只会让目录变大、让 agent 多翻无关文件。

## full.md 要求

- 含**权利要求书**（`What is claimed is:` / `Patentansprüche` / `权利要求书`）
- 最好含**部件标号表**（`REFERENCE SIGNS LIST` / `Bezugszeichenliste` / `附图标记`）
- 段落编号 `[0013]` 有更好（文档可引用段号）；**没有也行**，文档改用权项号与章节名定位
- 图片用相对路径 `images/…` 引用

## 图片要求

- 文件名随意，`full.md` 能对上就行
- 附图是图鉴与解剖台的主要素材，**要清楚的图**
- 看不清的图不要紧，`facts` 会列出来，agent 会在笔记里如实标注

## 加一件专利

```bash
cp -r /path/to/new-patent patents/EP_1234567_B1
node bin/patent.mjs list
```
