# 输入目录

每件专利一个子目录，**只放两样东西**：

```
patents/
└── US_10150093_B2/          ← 目录名随意，系统归一成 id
    ├── full.md              ← 专利全文
    └── images/              ← full.md 里 ![](images/xxx.jpg) 引用的图片
```

## full.md 要求

- 含**权利要求书**（章节标题形如 `What is claimed is:` / `Patentansprüche` / `权利要求书`）
- 最好含**部件标号表**（`REFERENCE SIGNS LIST` / `Bezugszeichenliste` / `附图标记`）
  没有也能跑，但解剖台与图鉴就只能用文字描述代替标号
- 段落编号 `[0013]` 保留（文档引用要用）
- 图片用相对路径 `images/…` 引用

## 加一件专利

```bash
cp -r /path/to/new-patent patents/EP_1234567_B1
node bin/patent.mjs list
```

## 准备 full.md（如果只有 PDF）

```bash
# 任意 PDF → markdown 工具，关键是保留权利要求与段落编号
pdftotext -layout patent.pdf - | ...
```

本仓库不内置 PDF 转换：全文抽取的质量直接决定后续一切，这一步值得单独做好。
`full.md` 里图片链接的命名只要和 `images/` 里一致即可。
