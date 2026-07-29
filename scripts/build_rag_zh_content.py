#!/usr/bin/env python3
"""【已停用】不再把产品侧摘要/词典等写入 RAG。

书卷/章节摘要、词典、主题、地图专题等由阅读器与词典产品入口提供，
不进入平台知识库向量索引。请勿再运行本脚本做入库准备。
"""
from __future__ import annotations


def main() -> int:
    print(
        "跳过：摘要/词典等产品内容不进入平台知识库。"
        "（原输出目录 content/commentary/study-bible-zh 已不再用于 RAG 索引）",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
