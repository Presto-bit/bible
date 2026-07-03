# Bible App — 一键开发命令。详见 docs/SETUP.md。
# 用法：make <target>，例如 `make setup`、`make api`、`make test`。

SHELL := /bin/bash
API_DIR := services/api
VENV := $(API_DIR)/.venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
PSQL := docker compose -f infra/docker-compose.yml exec -T postgres psql -U bible -d bible

.DEFAULT_GOAL := help

.PHONY: help
help: ## 显示可用命令
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── 环境 ──
$(VENV): ## 创建 venv
	python3 -m venv $(VENV)

.PHONY: setup
setup: $(VENV) ## 建 venv 并安装后端依赖
	$(PIP) install -q -r $(API_DIR)/requirements.txt
	@echo "✓ 依赖就绪。下一步：make db-up && make db-init"

# ── 数据库 ──
.PHONY: db-up
db-up: ## 启动 Postgres（需 Docker Desktop 运行）
	docker compose -f infra/docker-compose.yml up -d
	@echo "等待 PG..."; until $(PSQL) -c 'SELECT 1' >/dev/null 2>&1; do sleep 1; done; echo "✓ PG 就绪"

.PHONY: db-init
db-init: ## 应用全部 init SQL（含 002 用户同步表）
	$(PSQL) -f /docker-entrypoint-initdb.d/001_bible_rag.sql
	$(PSQL) -f /docker-entrypoint-initdb.d/002_user_sync.sql
	@echo "✓ schema 应用完成"

.PHONY: db-down
db-down: ## 停止 Postgres
	docker compose -f infra/docker-compose.yml down

# ── 数据流水线 ──
.PHONY: import-public-data
import-public-data: ## 导入公开数据集（交叉引用/词典/Strong's/主题/地理/和合本等）
	$(PY) scripts/import_public_data.py

.PHONY: import-bible-all
import-bible-all: import-bible ## CNV + KJV + 公版和合本
	$(PY) scripts/import_cuv.py

.PHONY: rag-index-pd
rag-index-pd: ## 公版注释 RAG 入库
	$(PY) scripts/rag_index.py --dir content/commentary/public-domain --source-type commentary --reuse

.PHONY: ensure-rag
ensure-rag: ## 公版注释全卷 + RAG 索引（发版同款）
	bash scripts/ensure_rag.sh

.PHONY: import-bible
import-bible: ## EPUB → verses.json → SQLite（CNV）
	$(PY) scripts/epub_to_verses.py --epub data/bible/cnv/圣经新译本.epub --translation cnv --format cnv --out data/bible/cnv/verses.json
	$(PY) scripts/import_bible.py --input data/bible/cnv/verses.json --out build/bible_cnv.sqlite

.PHONY: commentary
commentary: ## 注释 EPUB → 按章节 .md
	$(PY) scripts/commentary_to_md.py --epub "$$(ls content/commentary/*.epub | head -1)" --out content/commentary/extracted

.PHONY: rag-index
rag-index: ## 注释入库（需 PG + DashScope Key）
	$(PY) scripts/rag_index.py --dir content/commentary/extracted --source-type commentary

.PHONY: offline-pack
offline-pack: ## 打离线包（经库 + 内容 → zip）
	$(PY) scripts/build_offline_pack.py

.PHONY: clean
clean: ## 清理构建缓存与临时文件（见 scripts/clean.sh）
	bash scripts/clean.sh

.PHONY: clean-deps
clean-deps: ## 清理缓存并删除 node_modules / .venv
	CLEAN_DEPS=1 bash scripts/clean.sh

# ── 服务 / 测试 ──
.PHONY: api
api: ## 启动 FastAPI（localhost:8000）
	cd $(API_DIR) && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

.PHONY: test
test: ## 跑后端单测
	cd $(API_DIR) && .venv/bin/python -m pytest tests/ -q

.PHONY: dev
dev: db-up db-init api ## 一键：起库 + 建表 + 起 API
