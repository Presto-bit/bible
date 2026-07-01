# RAG 注释源文件

将 AI 资料库原始文件放在此目录，**通常不提交 git**（体积与版权）。

## 目录结构

```
content/
└── commentary/
    ├── john-gospel/
    │   ├── meta.json          # 书名、作者、经卷范围
    │   └── text.md            # 或 source.pdf
    └── faith-hope-love/
        └── ...
```

## meta.json 示例

```json
{
  "id": "john-gospel-commentary",
  "title": "约翰福音注释",
  "language": "zh",
  "books": ["JHN"],
  "source_type": "markdown",
  "rights": "internal-use-only"
}
```

## Markdown 标注经节（推荐）

在段落前标注，便于自动打 `scripture_refs`：

```markdown
## 约翰福音 3:16

神爱世人……这段经文表明……
```

## 建索引

```bash
python scripts/rag_index.py --source content/commentary/john-gospel
```

详见 [docs/RAG.md](../docs/RAG.md)。
