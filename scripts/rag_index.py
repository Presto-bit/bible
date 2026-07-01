#!/usr/bin/env python3
"""注释/参考材料入库 CLI。

用法：
  # 索引单文件
  python scripts/rag_index.py --file content/commentary/john.md
  # 索引整个目录（.md/.txt）
  python scripts/rag_index.py --dir content/commentary --source-type commentary
  # 检索自测
  python scripts/rag_index.py --query "约翰福音 3:16 重生的含义" --top-k 5

需先启动 Postgres（infra/docker-compose.yml）并在 services/api/.env 配置
DATABASE_URL / RAG_EMBEDDING_API_KEY（无 Key 则用 hash 兜底向量）。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# 允许直接脚本运行：把 services/api 加入 import path
API_DIR = Path(__file__).resolve().parent.parent / "services" / "api"
sys.path.insert(0, str(API_DIR))

from app.rag.index import (  # noqa: E402
    index_directory,
    index_file,
    load_embedding_cache,
)
from app.rag.retrieve import retrieve  # noqa: E402


def _purge_source_type(source_type: str) -> int:
    from app.db import get_pool

    pool = get_pool()
    with pool.connection() as conn:
        n = conn.execute(
            "DELETE FROM bible_documents WHERE source_type = %s", (source_type,)
        ).rowcount
        conn.commit()
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="Bible RAG 索引 / 检索")
    ap.add_argument("--file", type=Path, help="索引单个 .md/.txt 文件")
    ap.add_argument("--dir", type=Path, help="索引目录下所有 .md/.txt")
    ap.add_argument("--source-type", default="commentary", help="来源类型标签")
    ap.add_argument("--force", action="store_true", help="忽略 hash 强制重索引")
    ap.add_argument("--reuse", action="store_true",
                    help="复用已有 chunk_text 的向量（重建时省 embedding API）")
    ap.add_argument("--purge", action="store_true",
                    help="索引前清空该 source-type 的旧文档（配合重建覆盖）")
    ap.add_argument("--query", help="检索自测查询")
    ap.add_argument("--top-k", type=int, default=8)
    args = ap.parse_args()

    cache = None
    if args.reuse:
        cache = load_embedding_cache(args.source_type)
        print(f"复用缓存：{len(cache)} 个 chunk 向量")
    if args.purge:
        removed = _purge_source_type(args.source_type)
        print(f"已清空旧文档：{removed} 篇（source_type={args.source_type}）")

    if args.file:
        print(json.dumps(index_file(args.file, source_type=args.source_type, force=args.force, embedding_cache=cache), ensure_ascii=False, indent=2))
    if args.dir:
        results = index_directory(args.dir, source_type=args.source_type, force=args.force, embedding_cache=cache)
        total = sum(r.get("chunks", 0) for r in results if not r.get("error"))
        reused = sum(r.get("reused", 0) for r in results if not r.get("error"))
        print(json.dumps(results, ensure_ascii=False, indent=2))
        print(f"\n汇总：{len(results)} 篇，{total} 块，复用 {reused}，新嵌入 {total - reused}")
    if args.query:
        hits = retrieve(args.query, top_k=args.top_k)
        for h in hits:
            preview = h["chunk_text"][:120].replace("\n", " ")
            print(f"[{h['score']:.3f}] {h.get('title','?')} :: {preview}…")
        if not hits:
            print("（无结果）")
    if not (args.file or args.dir or args.query):
        ap.print_help()
        return 1
    return 0


if __name__ == "__main__":
    try:
        code = main()
    finally:
        # 干净关闭连接池，避免解释器退出期的 deallocator 噪声
        try:
            from app.db import close_pool

            close_pool()
        except Exception:
            pass
    raise SystemExit(code)
