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
COPY data /app/data
COPY deploy/api-entrypoint.sh /app/deploy/api-entrypoint.sh
RUN chmod +x /app/deploy/api-entrypoint.sh && mkdir -p /app/build

ENV PYTHONPATH=/app/services/api
ENV BIBLE_DB_PATH=/app/build/bible_cnv.sqlite
ENV BIBLE_KJV_DB_PATH=/app/build/bible_kjv.sqlite
ENV CONTENT_DATA_DIR=/app/data

WORKDIR /app/services/api
EXPOSE 8011

ENTRYPOINT ["/app/deploy/api-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8011"]
