# Bible API — 生产镜像（构建上下文为仓库根目录）
FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY services/api/requirements.txt /app/services/api/requirements.txt
RUN pip install --no-cache-dir -r /app/services/api/requirements.txt

COPY services/api /app/services/api
COPY scripts/import_bible.py /app/scripts/import_bible.py
COPY scripts/import_crossrefs.py /app/scripts/import_crossrefs.py
COPY scripts/import_strongs_gnosis.py /app/scripts/import_strongs_gnosis.py
COPY scripts/import_cuv.py /app/scripts/import_cuv.py
COPY scripts/import_commentary_pd.py /app/scripts/import_commentary_pd.py
COPY scripts/import_public_data.py /app/scripts/import_public_data.py
COPY scripts/ensure_content_data.sh /app/scripts/ensure_content_data.sh
COPY scripts/lib /app/scripts/lib
COPY scripts/rag_index.py /app/scripts/rag_index.py
COPY content /app/content
COPY data /app/data
COPY deploy/api-entrypoint.sh /app/deploy/api-entrypoint.sh
RUN chmod +x /app/deploy/api-entrypoint.sh /app/scripts/ensure_content_data.sh && mkdir -p /app/build /app/data/.cache

ENV PYTHONPATH=/app/services/api
ENV BIBLE_DB_PATH=/app/build/bible_cnv.sqlite
ENV BIBLE_KJV_DB_PATH=/app/build/bible_kjv.sqlite
ENV CONTENT_DATA_DIR=/app/data

WORKDIR /app/services/api
EXPOSE 8011

ENTRYPOINT ["/app/deploy/api-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8011"]
