"""启动时一次性 schema 补齐（E1）。"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)
_bootstrapped = False


def bootstrap_schemas(pool) -> None:
    global _bootstrapped
    if _bootstrapped:
        return
    try:
        from .social.im_schema import ensure_social_im_v12_pool

        ensure_social_im_v12_pool(pool)
    except Exception:
        logger.exception("bootstrap: social IM schema failed")
    try:
        from .admin.rag_jobs import ensure_rag_job_schema

        ensure_rag_job_schema()
    except Exception:
        logger.exception("bootstrap: rag job schema failed")
    _bootstrapped = True
    logger.info("schema bootstrap complete")
