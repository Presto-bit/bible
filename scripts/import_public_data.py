#!/usr/bin/env python3
"""一键导入公开圣经数据集。

用法：
  python scripts/import_public_data.py              # 全部（跳过需网络的失败项）
  python scripts/import_public_data.py --only crossrefs,entities
  python scripts/import_public_data.py --skip commentary,cuv
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"

STEPS = [
    ("crossrefs", "import_crossrefs.py", []),
    ("strongs", "import_strongs_gnosis.py", []),
    ("entities", "import_entities.py", []),
    ("topics", "import_topics.py", []),
    ("geography", "import_geography.py", []),
    ("cuv", "import_cuv.py", []),
    ("mcheyne", "build_mcheyne_plan.py", []),
    ("daily", "enrich_daily_verses.py", []),
    ("commentary", "import_commentary_pd.py", ["--books", "JHN", "MAT", "PSA", "GEN", "ROM"]),
    ("question_bank", "generate_question_bank.mjs", []),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="逗号分隔步骤名")
    ap.add_argument("--skip", help="逗号分隔跳过步骤")
    args = ap.parse_args()

    only = set(args.only.split(",")) if args.only else None
    skip = set(args.skip.split(",")) if args.skip else set()

    failed = []
    for name, script, extra in STEPS:
        if only and name not in only:
            continue
        if name in skip:
            print(f"⊘ 跳过 {name}")
            continue
        path = SCRIPTS / script
        print(f"\n── {name} ({script}) ──")
        if script.endswith(".mjs"):
            cmd = ["node", str(path), *extra]
        else:
            cmd = [sys.executable, str(path), *extra]
        r = subprocess.run(cmd, cwd=str(REPO))
        if r.returncode != 0:
            failed.append(name)
            print(f"⚠ {name} 失败 (exit {r.returncode})")

    print("\n════════════════════════════════════")
    if failed:
        print(f"完成，失败：{', '.join(failed)}")
        return 1
    print("✓ 全部导入步骤完成")
    print("  可选：make rag-index  （注释 RAG 入库）")
    print("  可选：make offline-pack")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
