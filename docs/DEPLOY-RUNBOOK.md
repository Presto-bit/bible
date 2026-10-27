# 发版手册（合一入口）

权威产品边界见 `docs/PRODUCT.md` §24。本页只谈运维落地。

## 一键流程

1. 构建并启动：`docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
2. 确认容器：`bible-api`、`bible-api-worker`、`bible-web`、`bible-postgres`
3. 探针：`bash deploy/post_deploy_check.sh`
4. （可选）公开域名再检：`PUBLIC_API=https://2sc.prestoai.cn bash deploy/post_deploy_check.sh`

## 环境要点

| 变量 | 说明 |
|------|------|
| `API_EMBEDDED_WORKERS` | 生产默认 `0`；后台任务由 `api-worker` 跑 |
| `REDIS_URL` | 限流 / SSE 跨实例唤醒；空则进程内存回退 |
| `PUSH_CRON_SECRET` | 消息 30 天清理与提醒 cron |
| `RAG_ANSWER_CACHE_REDIS_URL` | 答案缓存；可与 `REDIS_URL` 同值 |

## Cron（必挂）

示例：`deploy/cron/bible-cron.example`

一键安装（服务器）：

```bash
export PUSH_CRON_SECRET='与 .env.production 相同'
sudo -E bash deploy/cron/install_cron.sh
```

- 每天 04:20：`POST /social/retention/run`（`X-Cron-Secret`）
- 每日经文暖场：6:00–23:00 每 30 分钟 `POST /content/cron/daily-verse-warm`（管理后台需开启暖场开关）
- Web 探活可用 `deploy/harden_runtime.sh`
- 确认 worker：`docker ps --filter name=bible-api-worker`（digest / rag 不应只靠 API 进程）

## 健康检查

- 进程：`GET /health`
- 数据库：`GET /health/db`
- 发版后脚本：`deploy/post_deploy_check.sh`

## 备份与安全（清单勾选）

- [ ] Postgres 异地备份（日更）
- [ ] SSH 仅密钥登录、禁用密码
- [ ] `deploy/deploy.env` / `.env.production` 未进 git
- [ ] 证书到期监控

## Schema 过渡（勿一次砍 `ensure_*`）

双轨并存，**不要**在单次发版里批量删除 `ensure_*_schema`：

| 轨 | 职责 | 状态 |
|----|------|------|
| `infra/postgres/init/*.sql` + 启动时 `schema_migrations` | 登记 init 文件名、撞号告警 | 运维可见；非 Alembic |
| 各模块 `ensure_*_schema`（`schema_bootstrap` / 路由懒建） | 旧库补列、幂等建表 | **仍权威**；新库也靠它补齐 |

约定：

1. **新 DDL**：优先加编号 init SQL，并在对应 `ensure_*` 里保持幂等（旧库可补）。
2. **停用标记**：某段 `ensure_*` 确认全网库已具备后，先加注释 `# DEPRECATED: kept for old installs until YYYY-MM`，下一发版再删。
3. **禁止**：只改 ensure 不登记、或只加 init 不保证旧库可 `ensure`。

相关：`services/api/app/schema_migrations.py`。

## 服务器动手项：目的 / 未配影响

| 项 | 目的 | 未配置时 |
|----|------|----------|
| **cron → `/social/retention/run`** | 共读消息/附件 30 天物理清理（§23） | 消息与磁盘附件只增不减；库与卷膨胀，合规/成本风险 |
| **cron → `/content/cron/daily-verse-warm`** | 每日经文暖场分波写入（需后台 `enabled`） | 需人工点「立即跑一波」；首页互动数不涨 |
| **`bible-api-worker`**（`API_EMBEDDED_WORKERS=0`） | 推送 digest、RAG/后台任务与 API 请求进程隔离 | digest/后台任务不跑或拖垮 API；负载高时读经/IM 变慢 |
| **`REDIS_URL`** | 多实例限流与 IM SSE 跨进程唤醒 | 单机进程内回退仍可用；多副本时限流分裂、SSE 可能丢唤醒 |
| **`RAG_ANSWER_CACHE_REDIS_URL`** | RAG 答案缓存 | 每次重算，延迟与 token 成本升高（功能仍可用） |
| **Postgres 异地备份** | 故障可恢复 | 磁盘/机故障即不可恢复用户数据 |
| **SSH 密钥 + 禁密码** | 降爆破面 | 暴露面大；密钥泄露或弱密可直入 |

安装 cron：`sudo -E bash deploy/cron/install_cron.sh`（需 `PUSH_CRON_SECRET`）。

## 相关脚本

- `deploy/one_click_deploy.sh`
- `release.sh` / `deploy.sh`（仓库根）
- `DEPLOYMENT.md`（较旧细节，冲突以本手册 + compose 为准）
