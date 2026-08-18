# Gnosis 离线快照（CC-BY-SA v0.9.3）

发版机无出网时，`import_entities.py` / `import_relations.py` 从此目录回退，避免词典关系覆盖率退化。

| 文件 | 上游 |
|------|------|
| `gnosis-people-v0.9.3.json` | [spearssoftware/gnosis v0.9.3 people.json](https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/people.json) |
| `gnosis-places-v0.9.3.json` | [spearssoftware/gnosis v0.9.3 places.json](https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/places.json) |

许可：**CC-BY-SA** · 归属 Gnosis Biblical Knowledge Graph。

更新：下载新版本后重跑 `python scripts/import_relations.py && python scripts/validate_relations.py`。
