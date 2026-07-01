# 阿里云 ECS 部署指南（Git + Docker Compose）

Bible 项目 Git 仓库：**https://github.com/Presto-bit/bible**

与 [minimax_aipodcast](https://github.com/mark/minimax_aipodcast) 相同思路：**本地 push → 服务器 pull → `release.sh` 重建容器**。

## 架构

| 组件 | 容器端口 | 宿主机（仅本机） | 说明 |
|------|----------|------------------|------|
| Postgres | 5432 | 127.0.0.1:5433 | RAG / 同步 / 用户 |
| FastAPI | 8011 | 127.0.0.1:8011 | `/bible` `/ai` `/auth` … |
| Next.js | 3000 | 127.0.0.1:3000 | H5，`basePath=/2sc` |

公网经 **Nginx** 反代：`https://www.prestoai.cn/2sc` → Web；API 路径 → `8011`（见 `deploy/nginx-bible.example.conf`）。

---

## 一、准备 Git 仓库

Bible 项目需独立 Git 仓库（与 minimax 分开）。

```bash
cd /Users/mark/Desktop/PRO/Bible
git init
git remote add origin https://github.com/Presto-bit/bible.git
# 或 SSH：git remote add origin git@github.com:Presto-bit/bible.git
git add .
git commit -m "chore: initial bible app"
git branch -M main
git push -u origin main
```

服务器需能 `git clone`（SSH 密钥或 HTTPS 令牌）。

---

## 二、首次上线（阿里云 ECS）

### 1. 登录 ECS，安装 Git

```bash
sudo apt update && sudo apt install -y git
```

### 2. 克隆代码到固定目录

```bash
sudo mkdir -p /opt/bible-app
sudo chown ubuntu:ubuntu /opt/bible-app
git clone https://github.com/Presto-bit/bible.git /opt/bible-app
# 或 SSH：git clone git@github.com:Presto-bit/bible.git /opt/bible-app
cd /opt/bible-app
```

### 3. 配置环境变量

```bash
cp .env.production.example .env.production
nano .env.production   # 至少改 DB_PASSWORD、DEEPSEEK_API_KEY、RAG_EMBEDDING_API_KEY
```

### 4. 一键部署（安装 Docker + 构建 + 启动）

```bash
sudo bash deploy.sh --yes --user ubuntu --root /opt/bible-app
```

可选：复制 `deploy/deploy.env.example` → `deploy/deploy.env` 固化 `APP_USER`、`DEPLOY_ROOT`。

### 5. 健康检查

```bash
curl -s http://127.0.0.1:8011/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/2sc
```

### 6. Nginx（生产）

参考 `deploy/nginx-bible.example.conf`，将 `/2sc` 反代到 `127.0.0.1:3000`，将 `/bible`、`/ai`、`/auth` 等反代到 `127.0.0.1:8011`。

---

## 三、后续迭代发版

### 方式 A：服务器上发版（推荐）

```bash
# 本地
git add . && git commit -m "feat: xxx" && git push origin main

# SSH 到 ECS
cd /opt/bible-app
bash release.sh
```

`release.sh` 会：`git pull --ff-only` → `docker compose build` → `up -d` → 检查 API/Web。

### 方式 B：本地一键（push + SSH 发版）

```bash
cp deploy/publish.env.example deploy/publish.env
# 编辑 DEPLOY_SSH=ubuntu@你的ECS公网IP

bash scripts/publish.sh
```

等价于：本地 `git push` + 远程 `bash release.sh`。

### 常用环境变量（release.sh）

| 变量 | 默认 | 说明 |
|------|------|------|
| `APP_DIR` | `/opt/bible-app` | 服务器项目路径 |
| `BRANCH` | `main` | 拉取分支 |
| `GIT_PULL` | `1` | `0` 跳过 pull（离线包） |

---

## 四、与 minimax_aipodcast 的对应关系

| minimax | Bible |
|---------|-------|
| `docker-compose.ai-native.yml` | `docker-compose.prod.yml` |
| `.env.ai-native` | `.env.production` |
| `/opt/FYV` | `/opt/bible-app` |
| `release.sh` | `release.sh`（同逻辑，服务更少） |
| `deploy.sh` | `deploy.sh` |

---

## 五、安全与运维

- **勿提交**：`.env.production`、`deploy/deploy.env`、`deploy/publish.env`
- **安全组**：公网只开 `80`/`443`；`5433`/`8011`/`3000` 保持 `127.0.0.1` 绑定
- **生产**：`AUTH_DEV_ALLOW_USER_HEADER=0`
- **日志**：`docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api web`
- **数据库迁移**：新 SQL 放 `infra/postgres/init/`，已有卷需手动 `psql` 执行增量脚本

---

## 六、故障排查

| 现象 | 处理 |
|------|------|
| `git pull --ff-only` 失败 | 服务器工作区有本地修改，`git status` 后 stash 或重置 |
| Web 构建拉 Node 镜像慢 | `.env.production` 已默认华为云镜像；海外设 `NODE_BASE_IMAGE=node:20-alpine` |
| API 无经文 | 首次启动 entrypoint 会从 `data/bible/*/verses.json` 生成 SQLite |
| `/2sc` 404 | 确认 Nginx 未剥掉 `basePath`；直连 `curl localhost:3000/2sc` 先验证 |
