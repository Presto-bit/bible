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
    # ── 公版和合本（CUVS），第三译本对照 ──
    bible_cuvs_db_path: str = str(REPO_ROOT / "build" / "bible_cuvs.sqlite")

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
    rag_candidate_limit_book: int = 200
    rag_candidate_limit_chapter: int = 120
    # 无书卷过滤时的兜底上限（过高会拖垮助手首包）
    rag_candidate_limit_fallback: int = 280
    rag_query_embed_cache_ttl: int = 300
    note_rag_per_chapter_min_chunks: int = 2
    note_rag_max_chunks_abs: int = 512
    bible_rag_vector_backend: str = "auto"  # auto | pgvector | jsonb

    # ── AI 额度（游客）──
    ai_guest_daily_limit: int = 0

    # ── 认证（复用 minimax orchestrator opaque session）──
    orchestrator_base_url: str = ""  # 例 https://orchestrator.internal
    auth_me_path: str = "/api/v1/auth/me"
    # 开发期允许用 X-User-Code / X-User-Id 头直连（生产务必 false）
    auth_dev_allow_user_header: bool = False
    # 本机会话令牌 HMAC 密钥（生产必填；空则派生自 database_url，仅适合本地）
    session_token_secret: str = ""

    # ── 部署域名 ──
    api_base_url: str = "https://www.prestoai.cn"
    public_web_url: str = "https://www.prestoai.cn/2sc"
    # CORS：逗号分隔白名单。勿用 * 且 credentials（浏览器也不允许）
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── Web Push（VAPID）──
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:support@prestoai.cn"
    push_cron_secret: str = ""

    # ── 管理员（RAG 资料后台；口令必须通过环境变量配置，无弱默认）──
    admin_phone: str = ""
    admin_password: str = ""
    admin_token_secret: str = ""
    rag_upload_dir: str = str(REPO_ROOT / "data" / "rag" / "uploads")

    # ── 社交 IM 附件（local | s3 兼容 OSS/COS/MinIO）──
    social_media_backend: str = "local"
    social_media_upload_dir: str = str(REPO_ROOT / "data" / "social_message_uploads")
    social_media_bucket: str = ""
    social_media_region: str = "cn-hangzhou"
    social_media_access_key_id: str = ""
    social_media_secret_access_key: str = ""
    social_media_endpoint: str = ""  # 例 https://oss-cn-hangzhou.aliyuncs.com
    social_media_public_base: str = ""  # 保留配置兼容；媒体 URL 一律走预签名，不再发裸公开链


@lru_cache
def get_settings() -> Settings:
    return Settings()
