"""FastAPI 入口。M0：health 探针 + CORS。后续挂载 guide/ai/sync 路由。"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .admin.router import router as admin_router
from .ai.router import router as ai_router
from .analytics.middleware import DailyUvMiddleware
from .analytics.router import router as analytics_router
from .auth.router import router as auth_router
from .bible.router import router as bible_router
from .config import get_settings
from .content.router import router as content_router
from .db import close_pool, ping
from .guide.router import router as guide_router
from .push.router import router as push_router
from .social.router import router as social_router
from .social.im_router import router as social_im_router
from .sync.router import router as sync_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    close_pool()


app = FastAPI(
    title="Bible App API",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(DailyUvMiddleware)


app.include_router(bible_router)
app.include_router(guide_router)
app.include_router(ai_router)
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(sync_router)
app.include_router(content_router)
app.include_router(social_router)
app.include_router(social_im_router)
app.include_router(push_router)
app.include_router(analytics_router)


@app.get("/health")
def health() -> dict:
    """轻量健康检查：进程存活即 200，不依赖 DB。"""
    return {"status": "ok", "version": __version__}


@app.get("/health/db")
def health_db() -> dict:
    """数据库连通性探针。"""
    ok = ping()
    return {"status": "ok" if ok else "unavailable", "database": ok}


@app.get("/")
def root() -> dict:
    settings = get_settings()
    return {
        "service": "bible-api",
        "version": __version__,
        "docs": "/docs",
        "api_base_url": settings.api_base_url,
    }
