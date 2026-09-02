#!/usr/bin/env python3
"""批量镜像 FHL 和合本章级 MP3 到 data/bible_audio/（方案 1：服务器不出网）。

新约优先 springunv（128kbps 立体声），旧约 unv1（64kbps 单声道）；404 时自动回退 unv1。

在有外网的机器上运行，完成后 rsync 到阿里云；生产 API 设 BIBLE_AUDIO_OFFLINE=1 只读本地缓存。

用法：
  python scripts/mirror_bible_audio.py --all
  python scripts/mirror_bible_audio.py --book JHN
  python scripts/mirror_bible_audio.py --all --workers 4
  python scripts/mirror_bible_audio.py --all --dry-run

同步到服务器：
  bash deploy/sync_bible_audio.sh
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from epub_to_verses import BOOK_ORDER  # noqa: E402

FHL_MEDIA = "https://media.fhl.net"
FHL_CDN_NT = "springunv"
FHL_CDN_OT = "unv1"
FHL_CDN_FALLBACK = "unv1"
_HTTP_UA = "Mozilla/5.0 (compatible; BeiAi-Bible/1.0; +https://2sc.prestoai.cn)"
_MIN_BYTES = 32 * 1024
BOOKS_JSON = ROOT / "apps" / "web" / "public" / "offline" / "books.json"


def fhl_direct_url(bid: int, chapter: int, *, testament: str) -> str:
    cdn = FHL_CDN_NT if testament == "NT" else FHL_CDN_OT
    return f"{FHL_MEDIA}/{cdn}/{bid}/{bid}_{chapter:03d}.mp3"


def fhl_download_urls(bid: int, chapter: int, *, testament: str) -> list[str]:
    primary = fhl_direct_url(bid, chapter, testament=testament)
    fallback = f"{FHL_MEDIA}/{FHL_CDN_FALLBACK}/{bid}/{bid}_{chapter:03d}.mp3"
    if primary == fallback:
        return [primary]
    return [primary, fallback]


def load_books() -> list[dict]:
    if not BOOKS_JSON.is_file():
        raise SystemExit(f"缺少书卷表：{BOOKS_JSON}")
    data = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
    books = data.get("books") or []
    if not books:
        raise SystemExit("books.json 为空")
    return sorted(books, key=lambda b: BOOK_ORDER.get(b["id"], 999))


def dest_path(version: str, book_id: str, chapter: int) -> Path:
    return ROOT / "data" / "bible_audio" / version / book_id.upper() / f"{chapter}.mp3"


def is_cached(path: Path) -> bool:
    return path.is_file() and path.stat().st_size >= _MIN_BYTES


def download_one(url: str, dest: Path, retries: int = 3) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".mp3.part")
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _HTTP_UA})
            with urllib.request.urlopen(req, timeout=120) as resp:
                with tmp.open("wb") as out:
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        out.write(chunk)
            size = tmp.stat().st_size
            if size < _MIN_BYTES:
                raise ValueError(f"文件过小 ({size} bytes): {url}")
            tmp.replace(dest)
            return size
        except Exception as e:
            last_err = e
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise last_err or RuntimeError(f"download failed: {url}")


@dataclass
class Job:
    book_id: str
    book_name: str
    chapter: int
    bid: int
    testament: str


@dataclass
class Result:
    job: Job
    ok: bool
    skipped: bool = False
    bytes_: int = 0
    error: str = ""


def iter_jobs(books: list[dict], only_book: str | None) -> list[Job]:
    jobs: list[Job] = []
    only = only_book.upper() if only_book else None
    for b in books:
        book_id = b["id"]
        if only and book_id != only:
            continue
        bid = BOOK_ORDER.get(book_id)
        if bid is None:
            continue
        cc = int(b["chapter_count"])
        testament = str(b.get("testament") or "OT")
        for ch in range(1, cc + 1):
            jobs.append(Job(book_id, b.get("name", book_id), ch, bid, testament))
    return jobs


def run_job(version: str, job: Job, force: bool) -> Result:
    dest = dest_path(version, job.book_id, job.chapter)
    if not force and is_cached(dest):
        return Result(job, ok=True, skipped=True, bytes_=dest.stat().st_size)
    urls = fhl_download_urls(job.bid, job.chapter, testament=job.testament)
    last_err: Exception | None = None
    for url in urls:
        try:
            size = download_one(url, dest)
            return Result(job, ok=True, bytes_=size)
        except Exception as e:
            last_err = e
            if dest.exists():
                dest.unlink(missing_ok=True)
    return Result(job, ok=False, error=str(last_err or "download failed"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Mirror FHL chapter MP3s for offline API")
    parser.add_argument("--version", default="cuvs", help="音频译本目录名（默认 cuvs）")
    parser.add_argument("--book", help="仅镜像指定卷，如 JHN")
    parser.add_argument("--all", action="store_true", help="镜像全书 66 卷 1189 章")
    parser.add_argument("--workers", type=int, default=3, help="并发下载数（默认 3）")
    parser.add_argument("--force", action="store_true", help="覆盖已有缓存")
    parser.add_argument("--dry-run", action="store_true", help="只统计待下载，不拉取")
    args = parser.parse_args()

    if not args.all and not args.book:
        parser.error("请指定 --all 或 --book JHN")

    books = load_books()
    jobs = iter_jobs(books, args.book)
    total = len(jobs)
    pending = [
        j for j in jobs if args.force or not is_cached(dest_path(args.version, j.book_id, j.chapter))
    ]

    print(
        json.dumps(
            {
                "version": args.version,
                "total_chapters": total,
                "pending_download": len(pending),
                "storage_root": str(ROOT / "data" / "bible_audio" / args.version),
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if args.dry_run:
        return

    if not pending:
        print("全部章节已缓存，无需下载。", file=sys.stderr)
        return

    ok = skipped = failed = 0
    total_bytes = 0
    t0 = time.time()
    workers = max(1, min(args.workers, 8))

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(run_job, args.version, job, args.force): job for job in jobs
        }
        done = 0
        for fut in as_completed(futures):
            done += 1
            res = fut.result()
            if res.skipped:
                skipped += 1
            elif res.ok:
                ok += 1
                total_bytes += res.bytes_
                print(
                    f"[{done}/{total}] OK {res.job.book_id} {res.job.chapter} "
                    f"({res.bytes_ // 1024} KB)",
                    file=sys.stderr,
                )
            else:
                failed += 1
                print(
                    f"[{done}/{total}] FAIL {res.job.book_id} {res.job.chapter}: {res.error}",
                    file=sys.stderr,
                )

    manifest = {
        "version": args.version,
        "mirrored_at": int(time.time()),
        "total_chapters": total,
        "downloaded": ok,
        "skipped": skipped,
        "failed": failed,
        "bytes": total_bytes,
        "elapsed_sec": round(time.time() - t0, 1),
    }
    manifest_path = ROOT / "data" / "bible_audio" / args.version / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
