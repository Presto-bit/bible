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
# 本机与公网 CSS 都应为 200（见下方「宝塔」）
CSS=$(curl -s http://127.0.0.1:3002/ | grep -oE '/_next/static/css/[^"]+\.css' | head -1)
curl -s -o /dev/null -w "本机3002 CSS: %{http_code}\n" "http://127.0.0.1:3002${CSS}"
curl -s -o /dev/null -w "公网 HTTPS CSS: %{http_code}\n" "https://2sc.prestoai.cn${CSS}"
```

### 宝塔面板反代（必查）

`release.sh` 只保证 **Docker 本机 `127.0.0.1:3002`** 正常。域名 `https://2sc.prestoai.cn` 能否加载样式，取决于宝塔是否把流量转到 **3002**。

1. 宝塔 → **网站** → `2sc.prestoai.cn` → **设置**
2. **反向代理**（或「配置文件」）里，目标 URL 必须是：
   ```text
   http://127.0.0.1:3002
   ```
   **不要**再用 `3000`（该端口常被其它 Node 占用，且静态资源 404）。
3. **HTTP 与 HTTPS** 两套 server 块都要改（只改 80 不够，浏览器走 443）。
4. 保存后 **重载 Nginx**。

配置文件常见路径（供 SSH 排查）：

```text
/www/server/panel/vhost/nginx/2sc.prestoai.cn.conf
```

在 `server { listen 443 ssl; ... }` 内应有类似：

```nginx
location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

改完后执行：

```bash
nginx -t && nginx -s reload
CSS=$(curl -s http://127.0.0.1:3002/ | grep -oE '/_next/static/css/[^"]+\.css' | head -1)
curl -s -o /dev/null -w "公网 CSS: %{http_code}\n" "https://2sc.prestoai.cn${CSS}"
```

公网 CSS 为 **200** 后，浏览器 **Ctrl+Shift+R** 强刷即可看到 H5 布局。

---

## 四、后续发版

**本地 push + 服务器 pull（请用 `presto` 用户，勿用 root）：**

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
| 页面无样式 / 一直「加载中」 | 本机 `curl 127.0.0.1:3002` CSS=200 但公网 404 → **宝塔反代改 3002**（见 §宝塔）；否则 `docker exec bible-web ls .next/static/css/` |
| **发版后仅首页仍旧**（仍见 `3,842`、`知识闯关`；其它页如 `/challenge` 已是新版） | **Nginx/宝塔缓存了 `/`**。本机 `curl -s http://127.0.0.1:3002/ \| grep 每日问答` 有新内容、但 `curl -s https://2sc.prestoai.cn/ \| grep 3,842` 仍有旧内容即属此类。见下方 §首页缓存 |
| `dubious ownership` | 勿用 root 发版；`ssh presto@...` 后 `bash release.sh`，或 `sudo -u presto -H bash -c 'cd /opt/bible && bash release.sh'` |

### 首页缓存（发版后仅 `/` 仍旧）

**现象**：`/reader`、`/challenge` 已是新版，但打开 `https://2sc.prestoai.cn/` 仍显示 `3,842 人点赞`、`知识闯关` 等旧文案。

**原因**：首页曾被 Next 静态预渲染并带 `s-maxage=31536000`，宝塔/Nginx 把 **精确路径 `/`** 缓存了一年；带查询参数的请求（如 `/?v=1`）会绕过缓存拿到新版。

**立即处理（任选）**：

1. 宝塔 → **网站** → `2sc.prestoai.cn` → **缓存** → **清除全站缓存**
2. SSH 更新 Nginx，在 `server { listen 443 ... }` 内、`location /` **之前**加入（见 `deploy/nginx-baota-2sc.snippet.conf`）：
   ```nginx
   location = / {
       proxy_pass http://127.0.0.1:3002;
       proxy_no_cache 1;
       proxy_cache_bypass 1;
       add_header Cache-Control "no-cache, no-store, must-revalidate" always;
       # ... 其余 proxy_set_header 同 location /
   }
   ```
   然后 `nginx -t && nginx -s reload`
3. 用户端 **Ctrl+Shift+R** 强刷，或清除站点数据后重开

**验证**：

```bash
curl -s https://2sc.prestoai.cn/ | grep -E '3,842|每日问答'   # 应只有「每日问答」
curl -s "https://2sc.prestoai.cn/?nocache=$(date +%s)" | grep -E '3,842|每日问答'
```

**长期**：仓库已把首页改为 `force-dynamic` + `next.config` HTML `no-cache`；发版后新构建不再写入一年期 `s-maxage`。

旧版 `www.prestoai.cn/2sc` 路径已弃用；H5 现部署在独立子域根路径。
