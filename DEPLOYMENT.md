# 阿里云 ECS 部署指南

| 项 | 值 |
|----|-----|
| Git | https://github.com/Presto-bit/bible |
| 服务器 | `8.152.6.105` |
| SSH 用户 | `presto` |
| 代码目录 | `/opt/bible` |
| H5 域名 | **https://2sc.prestoai.cn** |
| API | 同域 `https://2sc.prestoai.cn`（Nginx 反代 `/bible` 等） |

完整参数见 [`deploy/server.env.example`](deploy/server.env.example)。

---

## 架构

| 组件 | 宿主机（仅本机） | 公网 |
|------|------------------|------|
| Postgres | 127.0.0.1:5433 | — |
| FastAPI | 127.0.0.1:8011 | 经 Nginx |
| Next.js | 127.0.0.1:3002 | **https://2sc.prestoai.cn** |

---

## 一、DNS（域名控制台）

在 `prestoai.cn` 添加解析：

| 类型 | 主机记录 | 记录值 |
|------|----------|--------|
| A | `2sc` | `8.152.6.105` |

生效后：`ping 2sc.prestoai.cn` 应指向该 IP。

---

## 二、阿里云安全组

入方向放行：

- TCP **22**（SSH，建议仅办公 IP）
- TCP **80**、**443**（Web）

**不要**对公网开放 5433 / 8011 / 3002。

---

## 三、首次上线（ECS）

```bash
ssh presto@8.152.6.105

sudo mkdir -p /opt/bible
sudo chown presto:presto /opt/bible
git clone https://github.com/Presto-bit/bible.git /opt/bible
cd /opt/bible

cp .env.production.example .env.production
nano .env.production   # 改 DB_PASSWORD、DEEPSEEK_API_KEY、RAG_EMBEDDING_API_KEY

sudo bash deploy.sh --yes --user presto --root /opt/bible
```

### Nginx + HTTPS

```bash
sudo cp deploy/nginx-2sc.prestoai.cn.conf /etc/nginx/sites-available/2sc.prestoai.cn
sudo ln -sf /etc/nginx/sites-available/2sc.prestoai.cn /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 2sc.prestoai.cn
```

### 验证

```bash
curl -s http://127.0.0.1:8011/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/
curl -sI https://2sc.prestoai.cn/ | head -5
```

---

## 四、后续发版

**本地 push + 服务器 pull：**

```bash
# 本地
git push origin main

# 服务器
ssh presto@8.152.6.105
cd /opt/bible && bash release.sh
```

**本地一键（已配置 `deploy/publish.env`）：**

```bash
bash scripts/publish.sh
```

`deploy/publish.env` 当前内容：

```
DEPLOY_SSH=presto@8.152.6.105
DEPLOY_APP_DIR=/opt/bible
```

若 SSH 用户不是 `presto`，在 `deploy/publish.env` 中修改 `DEPLOY_SSH`。

---

## 五、`.env.production` 必填项

| 变量 | 生产值 |
|------|--------|
| `DB_PASSWORD` | 强密码 |
| `NEXT_PUBLIC_BASE_PATH` | 留空 |
| `NEXT_PUBLIC_API_BASE` | `https://2sc.prestoai.cn` |
| `API_BASE_URL` | `https://2sc.prestoai.cn` |
| `PUBLIC_WEB_URL` | `https://2sc.prestoai.cn` |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `RAG_EMBEDDING_API_KEY` | DashScope |
| `AUTH_DEV_ALLOW_USER_HEADER` | `0` |

---

## 六、故障排查

| 现象 | 处理 |
|------|------|
| 域名无法访问 | 查 DNS A 记录、安全组 80/443 |
| 502 Bad Gateway | `docker compose ps`；`curl 127.0.0.1:3002` |
| `port is already allocated` | `ss -tlnp \| grep 3002` 查占用；改 `WEB_HOST_PORT` 并同步 Nginx `proxy_pass` |
| API 404 | Nginx 是否加载 `nginx-2sc.prestoai.cn.conf` |
| git pull 失败 | `git status`，勿在生产机改代码 |

旧版 `www.prestoai.cn/2sc` 路径已弃用；H5 现部署在独立子域根路径。
