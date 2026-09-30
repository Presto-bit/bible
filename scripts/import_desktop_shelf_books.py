#!/usr/bin/env python3
"""上传桌面「书籍上传」目录的 Word 到平台书架（需已部署含目录解析修复的 API）。"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = Path.home() / "Desktop" / "书籍上传"
API_BASE = os.environ.get("SHELF_API_BASE", "https://2sc.prestoai.cn").rstrip("/")


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)


def admin_login() -> str:
    phone = (os.environ.get("ADMIN_PHONE") or "").strip()
    password = (os.environ.get("ADMIN_PASSWORD") or "").strip()
    if not phone or not password:
        raise SystemExit("需要 ADMIN_PHONE / ADMIN_PASSWORD（可从 .env.production 注入环境）")
    req = urllib.request.Request(
        f"{API_BASE}/admin/auth/login",
        data=json.dumps({"phone": phone, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode())
    token = body.get("token")
    if not token:
        raise SystemExit(f"登录失败：{body}")
    return str(token)


def import_docx(token: str, path: Path, *, title: str | None = None) -> dict:
    boundary = "----BeiaiShelfBoundary7MA4YWxk"
    filename = path.name
    file_bytes = path.read_bytes()
    parts: list[bytes] = []
    if title:
        parts.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="title"\r\n\r\n'
                f"{title}\r\n"
            ).encode()
        )
    parts.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n"
        ).encode()
        + file_bytes
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(
        f"{API_BASE}/admin/shelf/upload",
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "X-Admin-Token": token,
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:800]
        raise RuntimeError(f"HTTP {e.code}: {detail}") from e


def main() -> None:
    _load_dotenv(ROOT / ".env.production")
    _load_dotenv(ROOT / "services" / "api" / ".env")
    folder = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_DIR
    files = sorted(folder.glob("*.docx"))
    if not files:
        raise SystemExit(f"无 docx：{folder}")
    print(f"API={API_BASE} files={len(files)}")
    token = admin_login()
    print("admin login ok")
    for f in files:
        title = f.stem
        print(f"→ importing {f.name} …")
        try:
            res = import_docx(token, f, title=title)
        except Exception as e:
            print(f"  FAIL {e}")
            continue
        print(
            f"  OK id={res.get('id')} title={res.get('title')} "
            f"sections={res.get('section_count')} needs_confirm={res.get('needs_toc_confirm')}"
        )
        outline = ((res.get("preview") or {}).get("toc_outline") or [])[:8]
        for item in outline:
            if isinstance(item, dict):
                print(f"    · {item.get('title')}")


if __name__ == "__main__":
    main()
