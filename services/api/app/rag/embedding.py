"""Embedding Provider（精简版，移植自 minimax fyv_shared.embedding_provider）。

仅保留 Bible App 所需：
  • api 模式：OpenAI 兼容 /embeddings（DashScope compatible-mode，text-embedding-v4 / dim 1024 / batch 10）
  • hash 兜底：无 Key 或 api 失败时退化为本地哈希向量（保证离线/无网可跑，质量较低）

不含 sparse / 多链路 / 查询缓存 / MiniMax 回退（按需再加）。用 httpx 同步客户端。
"""
from __future__ import annotations

import hashlib
import logging
import math
import re

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

DEFAULT_DIM = 1024
DEFAULT_BATCH = 10
HASH_DIM = 256


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z0-9_]+", (text or "").lower())


def hashed_vector(text: str, dim: int = HASH_DIM) -> list[float]:
    vec = [0.0] * dim
    for tok in _tokenize(text):
        h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16) % dim
        vec[h] += 1.0
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


def _parse_openai_embeddings(payload: dict, n: int) -> list[list[float]]:
    data = payload.get("data")
    if isinstance(data, list) and data:
        vectors: list[list[float]] = []
        ordered = sorted(
            data, key=lambda it: it.get("index", 0) if isinstance(it, dict) else 0
        )
        for item in ordered:
            emb = item.get("embedding") if isinstance(item, dict) else None
            if isinstance(emb, list) and emb:
                vectors.append([float(x) for x in emb])
        if len(vectors) == n:
            return vectors
    raise RuntimeError(f"embedding 返回无法解析（keys={list(payload)[:8]}）")


class EmbeddingProvider:
    def __init__(self) -> None:
        s = get_settings()
        self.mode = (s.rag_embedding_provider or "api").strip().lower()
        self.api_url = (s.rag_embedding_api_url or "").strip()
        self.api_key = (s.rag_embedding_api_key or "").strip()
        self.model = (s.rag_embedding_model or "text-embedding-v4").strip()
        self.dim = DEFAULT_DIM
        self.timeout = 25.0

    def _can_api(self) -> bool:
        return bool(self.api_url and self.api_key and self.model)

    def active_backend(self) -> str:
        if self.mode == "hash":
            return "hash"
        return "api" if self._can_api() else "hash"

    def signature(self, dim: int) -> str:
        """入库向量签名：backend 或维度变化即应重索引。"""
        return f"v1|{self.active_backend()}|{int(dim)}|{self.model}"

    # ── 文档/查询向量 ──
    def embed(self, texts: list[str]) -> list[list[float]]:
        texts = [t if (t and t.strip()) else " " for t in (texts or [])]
        if not texts:
            return []
        if self.active_backend() == "api":
            try:
                return self._embed_api_batched(texts)
            except Exception as exc:  # 失败兜底，保证可用
                logger.warning("embedding api 失败，退化 hash：%s", exc)
        return [hashed_vector(t) for t in texts]

    def embed_one(self, text: str) -> list[float]:
        out = self.embed([text])
        return out[0] if out else []

    def _embed_api_batched(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        with httpx.Client(timeout=self.timeout) as client:
            for i in range(0, len(texts), DEFAULT_BATCH):
                batch = texts[i : i + DEFAULT_BATCH]
                out.extend(self._embed_post(client, batch))
        return out

    def _embed_post(self, client: httpx.Client, batch: list[str]) -> list[list[float]]:
        body = {
            "model": self.model,
            "input": batch,
            "encoding_format": "float",
            "dimensions": self.dim,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        resp = client.post(self.api_url, json=body, headers=headers)
        resp.raise_for_status()
        return _parse_openai_embeddings(resp.json(), len(batch))


_provider: EmbeddingProvider | None = None


def get_provider() -> EmbeddingProvider:
    global _provider
    if _provider is None:
        _provider = EmbeddingProvider()
    return _provider
