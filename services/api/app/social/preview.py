"""Office 附件预览：LibreOffice 转 PDF（可选，未安装时返回 None）。"""
from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_OFFICE_SUFFIX = frozenset({
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
})


def office_preview_suffixes() -> frozenset[str]:
    return _OFFICE_SUFFIX


def needs_server_pdf_preview(file_name: str | None, mime: str | None = None) -> bool:
    _ = mime
    suf = Path((file_name or "").lower()).suffix
    return suf in {".doc", ".ppt", ".pptx"}


def convert_office_to_pdf(data: bytes, file_name: str) -> bytes | None:
    """尽力用 LibreOffice 将 Office 文档转为 PDF；失败返回 None。"""
    lo = shutil.which("libreoffice") or shutil.which("soffice")
    if not lo:
        logger.info("LibreOffice 未安装，跳过 Office 转 PDF 预览")
        return None
    safe_name = Path(file_name or "file.bin").name
    if Path(safe_name).suffix.lower() not in _OFFICE_SUFFIX:
        return None
    try:
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / safe_name
            src.write_bytes(data)
            proc = subprocess.run(
                [lo, "--headless", "--convert-to", "pdf", "--outdir", td, str(src)],
                capture_output=True,
                timeout=120,
                check=False,
            )
            if proc.returncode != 0:
                logger.warning(
                    "LibreOffice convert failed: %s",
                    proc.stderr.decode("utf-8", errors="replace")[:400],
                )
                return None
            pdf = Path(td) / f"{src.stem}.pdf"
            if not pdf.is_file():
                return None
            return pdf.read_bytes()
    except Exception:
        logger.exception("convert_office_to_pdf failed")
        return None
