"""独立后台 worker：digest 推送 + RAG 索引。

用法（容器 / 本机）：
  python -m app.workers

生产：compose 中 api 设 API_EMBEDDED_WORKERS=0，由本进程承接。
"""
from __future__ import annotations

import logging
import signal
import threading
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("app.workers")

_stop = threading.Event()


def _handle_signal(signum, _frame) -> None:
    logger.info("signal %s received, shutting down workers", signum)
    _stop.set()


def main() -> None:
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    from .db import get_pool, close_pool
    from .schema_bootstrap import bootstrap_schemas

    try:
        bootstrap_schemas(get_pool())
    except Exception:
        logger.exception("worker bootstrap_schemas failed")

    from .admin.rag_jobs import start_rag_index_worker
    from .push.digest_scheduler import start_digest_worker
    from .social.outreach_worker import start_outreach_worker

    start_rag_index_worker()
    start_digest_worker()
    start_outreach_worker()
    logger.info("api-worker running (rag-index + push-digest + outreach)")

    while not _stop.is_set():
        time.sleep(1.0)

    close_pool()
    logger.info("api-worker stopped")


if __name__ == "__main__":
    main()
