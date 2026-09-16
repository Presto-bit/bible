# Bible API — 生产镜像（构建上下文为仓库根目录）
FROM python:3.12-slim-bookworm

WORKDIR /app

# 国内 VPS 构建可设 PyPI 镜像；compose 默认阿里云（清华源偶有 403）
ARG PIP_INDEX_URL=
ARG PIP_TRUSTED_HOST=

# 国内 VPS 构建：Debian 源换阿里云，避免 deb.debian.org 拉索引过慢
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends curl fontconfig fonts-noto-cjk \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

COPY services/api/requirements.txt /app/services/api/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir \
       --index-url "${PIP_INDEX_URL:-https://pypi.org/simple}" \
       ${PIP_TRUSTED_HOST:+--trusted-host "$PIP_TRUSTED_HOST"} \
       -r /app/services/api/requirements.txt

COPY services/api /app/services/api

# 圣经 / 内容 SQLite 生成
COPY scripts/import_bible.py /app/scripts/import_bible.py
COPY scripts/import_crossrefs.py /app/scripts/import_crossrefs.py
COPY scripts/import_strongs.py /app/scripts/import_strongs.py
COPY scripts/import_strongs_gnosis.py /app/scripts/import_strongs_gnosis.py
COPY scripts/import_cuv.py /app/scripts/import_cuv.py
COPY scripts/import_kjv_scrollmapper.py /app/scripts/import_kjv_scrollmapper.py
COPY scripts/import_entities.py /app/scripts/import_entities.py
COPY scripts/import_relations.py /app/scripts/import_relations.py
COPY scripts/validate_relations.py /app/scripts/validate_relations.py
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
# 只 COPY API 只读内容；运行时目录见下方 mkdir（shelf_uploads/bible_audio 由 compose volume 挂载）
COPY data/bible /app/data/bible
COPY data/crossrefs /app/data/crossrefs
COPY data/strongs /app/data/strongs
COPY data/vendor /app/data/vendor
COPY data/plans /app/data/plans
COPY data/illustrations /app/data/illustrations
COPY data/topics /app/data/topics
COPY data/geography /app/data/geography
COPY data/summaries /app/data/summaries
COPY data/dictionary /app/data/dictionary
COPY data/diagrams /app/data/diagrams
COPY data/knowledge /app/data/knowledge
COPY data/daily-verses /app/data/daily-verses
COPY data/shelf /app/data/shelf
COPY deploy/api-entrypoint.sh /app/deploy/api-entrypoint.sh

RUN chmod +x /app/deploy/api-entrypoint.sh \
    /app/scripts/ensure_content_data.sh \
    /app/scripts/ensure_rag.sh \
  && mkdir -p \
    /app/build \
    /app/data/.cache \
    /app/data/rag/uploads \
    /app/data/bible_audio \
    /app/data/shelf_uploads \
    /app/data/shelf_html_cache \
    /app/data/social_message_uploads \
    /app/data/group_task_uploads \
    /app/data/listen_cache \
    /app/content/commentary/public-domain \
    /app/content/commentary/public-domain-ocd \
    /app/content/commentary/reference-en \
    /app/content/commentary/study-bible-zh \
    /app/content/commentary/study-bible \
  && cp -f /app/data/vendor/gnosis-people-v0.9.3.json /app/data/.cache/gnosis-people.json \
  && cp -f /app/data/vendor/gnosis-places-v0.9.3.json /app/data/.cache/gnosis-places.json

ENV PYTHONPATH=/app/services/api
ENV BIBLE_DB_PATH=/app/build/bible_cnv.sqlite
ENV BIBLE_KJV_DB_PATH=/app/build/bible_kjv.sqlite
ENV BIBLE_CUVS_DB_PATH=/app/build/bible_cuvs.sqlite
ENV BIBLE_CONTEMPORARY_DB_PATH=/app/build/bible_contemporary.sqlite
ENV BIBLE_NIV_DB_PATH=/app/build/bible_niv.sqlite
ENV CONTENT_DATA_DIR=/app/data

WORKDIR /app/services/api
EXPOSE 8011

ENTRYPOINT ["/app/deploy/api-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8011"]
