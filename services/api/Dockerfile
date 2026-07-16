# Bible API — 生产镜像（构建上下文为仓库根目录）
FROM python:3.12-slim-bookworm

WORKDIR /app

# 国内 VPS 构建可设 PyPI 镜像，避免 files.pythonhosted.org 超时
ARG PIP_INDEX_URL=

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY services/api/requirements.txt /app/services/api/requirements.txt
RUN pip install --no-cache-dir \
       --index-url "${PIP_INDEX_URL:-https://pypi.org/simple}" \
       -r /app/services/api/requirements.txt

COPY services/api /app/services/api

# 圣经 / 内容 SQLite 生成
COPY scripts/import_bible.py /app/scripts/import_bible.py
COPY scripts/import_crossrefs.py /app/scripts/import_crossrefs.py
COPY scripts/import_strongs.py /app/scripts/import_strongs.py
COPY scripts/import_strongs_gnosis.py /app/scripts/import_strongs_gnosis.py
COPY scripts/import_cuv.py /app/scripts/import_cuv.py
COPY scripts/import_kjv_scrollmapper.py /app/scripts/import_kjv_scrollmapper.py
COPY scripts/epub_to_verses.py /app/scripts/epub_to_verses.py
COPY scripts/ensure_content_data.sh /app/scripts/ensure_content_data.sh

# RAG 脚本（管理后台 / 本地 ensure-rag 调用，发版不再自动执行）
COPY scripts/ensure_rag.sh /app/scripts/ensure_rag.sh
COPY scripts/rag_index.py /app/scripts/rag_index.py
COPY scripts/import_commentary_pd.py /app/scripts/import_commentary_pd.py
COPY scripts/import_commentary_ocd.py /app/scripts/import_commentary_ocd.py
COPY scripts/build_rag_zh_content.py /app/scripts/build_rag_zh_content.py
COPY scripts/lib /app/scripts/lib

COPY content /app/content
COPY data /app/data
COPY deploy/api-entrypoint.sh /app/deploy/api-entrypoint.sh

RUN chmod +x /app/deploy/api-entrypoint.sh \
    /app/scripts/ensure_content_data.sh \
    /app/scripts/ensure_rag.sh \
  && mkdir -p \
    /app/build \
    /app/data/.cache \
    /app/data/rag/uploads \
    /app/content/commentary/public-domain \
    /app/content/commentary/public-domain-ocd \
    /app/content/commentary/reference-en \
    /app/content/commentary/study-bible-zh \
    /app/content/commentary/study-bible

ENV PYTHONPATH=/app/services/api
ENV BIBLE_DB_PATH=/app/build/bible_cnv.sqlite
ENV BIBLE_KJV_DB_PATH=/app/build/bible_kjv.sqlite
ENV CONTENT_DATA_DIR=/app/data

WORKDIR /app/services/api
EXPOSE 8011

ENTRYPOINT ["/app/deploy/api-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8011"]
