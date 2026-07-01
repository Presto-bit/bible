"""应用配置：从 services/api/.env 读取（pydantic-settings）。"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── 数据库 ──
    database_url: str = "postgresql://bible:bible@localhost:5432/bible"

    # ── 离线经文 SQLite（CNV 为主译本，供后端取经文文本/卷名）──
    bible_db_path: str = str(REPO_ROOT / "build" / "bible_cnv.sqlite")
    # ── 英文对照译本（KJV），用于多译本对照；缺失时自动降级为单译本 ──
    bible_kjv_db_path: str = str(REPO_ROOT / "build" / "bible_kjv.sqlite")

    # ── 静态内容数据目录（计划/每日经文/祷告/交叉引用/词典/插画）──
    content_data_dir: str = str(REPO_ROOT / "data")

    # ── LLM（DeepSeek，OpenAI 兼容）──
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_text_model: str = "deepseek-v4-flash"

    # ── Embedding（DashScope，OpenAI 兼容）──
    rag_embedding_provider: str = "api"
    rag_embedding_api_key: str = ""
    rag_embedding_api_url: str = (
        "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
    )
    rag_embedding_model: str = "text-embedding-v4"

    # ── RAG 切块与检索 ──
    rag_chunk_chars: int = 900
    rag_chunk_overlap: int = 70
    bible_rag_index_strategy: str = "per_chapter"
    rag_hybrid_vector_weight: float = 0.55
    rag_hybrid_keyword_weight: float = 0.45

    # ── AI 额度（游客）──
    ai_guest_daily_limit: int = 10

    # ── 认证（复用 minimax orchestrator opaque session）──
    orchestrator_base_url: str = ""  # 例 https://orchestrator.internal
    auth_me_path: str = "/api/v1/auth/me"
    # 开发期允许用 X-User-Id 头直连（无 orchestrator 时调试同步）
    auth_dev_allow_user_header: bool = True

    # ── 部署域名 ──
    api_base_url: str = "https://www.prestoai.cn"
    public_web_url: str = "https://www.prestoai.cn/2sc"

    # ── Web Push（VAPID）──
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:support@prestoai.cn"
    push_cron_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
