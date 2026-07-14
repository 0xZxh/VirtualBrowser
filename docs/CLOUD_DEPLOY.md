# VirtualBrowser 云端生产部署 SOP

> **适用阶段：** S6 云端交付  
> **组件：** MongoDB + `server-backend`（NestJS）+ Nginx（HTTPS 反向代理）  
> **最后更新：** 2026-07-11（Agent-S6）  
> **关联文档：** [06-deployment](modules/06-deployment.md)、[07-backend-stack](modules/07-backend-stack.md)、[INTEGRATION §Deploy→All](INTEGRATION.md#deploy-all)

---

## 1. 架构概览

```mermaid
flowchart TB
  subgraph clients [客户端]
    Electron[S7 desktop-shell]
    Browser[管理 UI 静态页]
  end

  subgraph edge [边缘层]
    Nginx[Nginx HTTPS :443]
  end

  subgraph app [应用层]
    Backend[server-backend :3001]
  end

  subgraph data [数据层]
    Mongo[(MongoDB)]
    Profiles[data/profiles/ 磁盘]
  end

  Electron -->|Bearer JWT| Nginx
  Browser -->|Bearer JWT| Nginx
  Nginx -->|/api /auth /health| Backend
  Backend --> Mongo
  Backend --> Profiles
```

### 职责划分

| 组件 | 职责 | 端口（默认） |
|------|------|--------------|
| **Nginx** | TLS 终结、反向代理、可选静态托管 `server/dist` | 443（HTTPS） |
| **server-backend** | 认证、用户/环境 CRUD、Profile 快照 API | 3001（内网） |
| **MongoDB** | 用户、会话、环境元数据持久化 | 27017（内网） |
| **磁盘 `DATA_DIR`** | Profile 快照 zip（`profiles/{tenantId}/{envId}/`） | — |

### dev 与生产差异

| 项 | dev（本机） | S6 生产 |
|----|-------------|---------|
| 存储 | `STORAGE_DRIVER=local`（SQLite） | **`STORAGE_DRIVER=mongo`** |
| API 入口 | `localhost:3001` 或 `/dev-api` 代理 | **HTTPS 域名**（Nginx → backend） |
| CORS | 默认 `*`（允许任意来源） | 建议设置 `CORS_ORIGINS` 白名单 |
| Profile 路径 | `server-backend/data/profiles/` | 生产目录如 `/var/lib/virtualbrowser/data/profiles/` |
| Native 桥接 | `dev-native-bridge` | **不在云端**；由 S7 客户端本机 `native-runtime` 调用云端 API |

---

## 2. 前置条件

### 2.1 服务器要求

| 项 | 最低要求 |
|----|----------|
| OS | Linux（推荐 Ubuntu 22.04+）或 Windows Server |
| Node.js | **18+**（见 `server-backend/package.json` engines） |
| MongoDB | **6.0+**（单机或副本集均可；生产建议副本集） |
| Nginx | 1.18+，已配置有效 TLS 证书 |
| 磁盘 | Profile 快照按环境增长；建议 ≥ 50 GB 独立数据盘 |
| 网络 | 443 对外；3001、27017 **仅内网** |

### 2.2 域名与证书

- 准备 API 域名，例如 `api.example.com`
- TLS 证书：Let's Encrypt（`certbot`）或企业 CA
- S7 客户端 `client.json` / 构建注入的 `VUE_APP_BASE_API` 须与此域名一致（见 [INTEGRATION §Deploy→Client](INTEGRATION.md#deploy-client)）

### 2.3 仓库与构建产物

```powershell
# 克隆（或 CI 拉取）
git clone <repo-url> VirtualBrowser
cd VirtualBrowser/server-backend
npm ci
npm run build
# 产出 dist/main.js
```

管理 UI 静态资源（可选，若由 Nginx 托管）：

```powershell
cd VirtualBrowser/server
npm ci
npm run build:prod
# 产出 dist/server/
```

---

## 3. MongoDB 部署

### 3.1 安装（Ubuntu 示例）

```bash
# 官方仓库安装 MongoDB 7.x（按发行版文档调整）
sudo apt-get install -y mongodb-org
sudo systemctl enable mongod
sudo systemctl start mongod
```

### 3.2 创建数据库与用户

```javascript
// mongosh
use virtualbrowser

db.createUser({
  user: "vb_app",
  pwd: "<强密码>",
  roles: [{ role: "readWrite", db: "virtualbrowser" }]
})
```

连接串示例：

```
mongodb://vb_app:<密码>@127.0.0.1:27017/virtualbrowser?authSource=virtualbrowser
```

### 3.3 集合说明（首次启动自动创建）

| 集合 | 用途 |
|------|------|
| `users` | 用户账号、bcrypt 密码、roles、tenantId |
| `sessions` | Bearer token 会话 |
| `environments` | 指纹环境元数据（ownerId / tenantId） |

> Profile 快照 **zip 文件不落 Mongo**，始终存于 `DATA_DIR/profiles/`（见 [07-backend-stack §2](modules/07-backend-stack.md)）。

### 3.4 备份建议

```bash
# 每日逻辑备份
mongodump --uri="mongodb://vb_app:<密码>@127.0.0.1:27017/virtualbrowser" \
  --out=/backup/mongo/$(date +%Y%m%d)

# Profile 快照目录同步（与 DB 备份策略一致）
rsync -a /var/lib/virtualbrowser/data/profiles/ /backup/profiles/
```

---

## 4. server-backend 部署

### 4.1 目录布局（推荐）

```
/opt/virtualbrowser/
├── server-backend/
│   ├── dist/              # npm run build 产物
│   ├── node_modules/
│   ├── package.json
│   └── .env               # 生产环境变量（勿提交 git）
└── data/                  # DATA_DIR 指向此处
    └── profiles/
```

### 4.2 环境变量（`.env`）

```bash
# 监听（仅本机，由 Nginx 反代）
PORT=3001

# ── 存储：生产必须 mongo ──
STORAGE_DRIVER=mongo
MONGODB_URI=mongodb://vb_app:<密码>@127.0.0.1:27017/virtualbrowser?authSource=virtualbrowser

# Profile 快照根目录（其下自动创建 profiles/{tenantId}/{envId}/）
DATA_DIR=/var/lib/virtualbrowser/data

# ── CORS（生产建议显式配置）──
# 逗号分隔；未设或 * = 允许任意来源
# Electron file:// 或自定义协议时可能需单独评估
CORS_ORIGINS=https://app.example.com,https://admin.example.com

# 可选：Node 运行模式
NODE_ENV=production
```

完整变量表见 [07-backend-stack §6](modules/07-backend-stack.md#6-环境变量) 与 [`server-backend/.env.example`](../server-backend/.env.example)。

### 4.3 安装与启动

```bash
cd /opt/virtualbrowser/server-backend
npm ci --omit=dev
npm run build

# 创建数据目录
sudo mkdir -p /var/lib/virtualbrowser/data/profiles
sudo chown -R <运行用户>:<运行用户> /var/lib/virtualbrowser

# 前台验证
npm start
# 日志应含：
# [server-backend] NestJS http://localhost:3001
# [server-backend] STORAGE_DRIVER=mongo
# [server-backend] MONGODB_URI=...
# [server-backend] CORS_ORIGINS=...
```

### 4.4 systemd 服务（Linux）

```ini
# /etc/systemd/system/virtualbrowser-backend.service
[Unit]
Description=VirtualBrowser API (NestJS)
After=network.target mongod.service

[Service]
Type=simple
User=vb
WorkingDirectory=/opt/virtualbrowser/server-backend
EnvironmentFile=/opt/virtualbrowser/server-backend/.env
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable virtualbrowser-backend
sudo systemctl start virtualbrowser-backend
sudo systemctl status virtualbrowser-backend
```

### 4.5 种子用户

首次启动且 `users` 集合为空时，自动写入：

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | admin |
| operator | operator123 | operator |
| viewer | viewer123 | viewer |

**生产上线后务必修改默认密码**（通过管理 UI `/system/users` 或 Mongo 直接更新 bcrypt 哈希）。

---

## 5. Nginx 反向代理配置

### 5.1 仅 API（推荐最小配置）

客户端（S7）自带内嵌 UI，云端通常只需暴露 API：

```nginx
# /etc/nginx/sites-available/virtualbrowser-api
upstream vb_backend {
    server 127.0.0.1:3001;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    # Profile 快照上传最大 512MB（与 main.ts raw limit 一致）
    client_max_body_size 512m;

    location / {
        proxy_pass http://vb_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 快照上传可能较慢
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}

server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/virtualbrowser-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5.2 API + 管理 UI 静态托管（可选）

若需在浏览器直接访问管理后台（非 Electron）：

```nginx
server {
    listen 443 ssl http2;
    server_name admin.example.com;

    ssl_certificate     /etc/letsencrypt/live/admin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.com/privkey.pem;

    root /opt/virtualbrowser/server/dist/server;
    index index.html;

    client_max_body_size 512m;

    # API 反代（前端 VUE_APP_BASE_API=/prod-api 时）
    location /prod-api/ {
        rewrite ^/prod-api/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # SPA 回退
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

构建前端前设置 `server/.env.production`：

```
VUE_APP_BASE_API = '/prod-api'
```

### 5.3 路径映射一览

| 对外路径（Nginx） | 后端实际路径 | 说明 |
|-------------------|--------------|------|
| `GET /health` | `GET /health` | 健康检查 |
| `POST /auth/login` | 同左 | 登录 |
| `GET /auth/me` | 同左 | 当前用户（Bearer） |
| `GET /api/environments` | 同左 | 环境列表 |
| `GET/POST /api/profiles/:envId/snapshot` | 同左 | 快照下载/上传 |
| `GET/POST/PUT/DELETE /api/users` | 同左 | 用户管理（admin） |

---

## 6. CORS 配置

### 6.1 行为说明

`server-backend/src/main.ts` 通过环境变量 `CORS_ORIGINS` 控制：

| `CORS_ORIGINS` | 行为 |
|----------------|------|
| 未设置或 `*` | 允许任意 `Origin`（与 dev 默认一致） |
| 逗号分隔 URL | 仅允许列表中的来源，如 `https://admin.example.com` |

始终启用 `credentials: true`，以支持带 Cookie / Authorization 的跨域请求。

### 6.2 典型场景

| 客户端 | 建议 `CORS_ORIGINS` |
|--------|---------------------|
| S7 Electron（`file://` 或自定义协议） | 开发期可暂用 `*`；生产按实际 Origin 收紧或配合同源代理 |
| 浏览器访问 `admin.example.com` | `https://admin.example.com` |
| 多域管理后台 | `https://a.example.com,https://b.example.com` |

### 6.3 验证

```bash
curl -s -D - -o /dev/null \
  -H "Origin: https://admin.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS \
  https://api.example.com/auth/login
# 应返回 Access-Control-Allow-Origin: https://admin.example.com
```

---

## 7. 健康检查

### 7.1 端点

```
GET /health
```

### 7.2 响应示例（mongo 正常）

```json
{
  "ok": true,
  "service": "virtualbrowser-backend",
  "stack": "nestjs",
  "storage": "mongo",
  "mongo": "connected"
}
```

| 字段 | 说明 |
|------|------|
| `ok` | `storage=mongo` 时须 Mongo 已连接才为 `true` |
| `storage` | `local` 或 `mongo` |
| `mongo` | `connected` / `disconnected` / `n/a` |

### 7.3 运维探测

```bash
# 经 Nginx
curl -fsS https://api.example.com/health | jq .

# 直连 backend（排障）
curl -fsS http://127.0.0.1:3001/health | jq .
```

可将 `ok: true` 作为负载均衡 / Kubernetes liveness 判断条件。

---

## 8. 部署后验证清单

按顺序执行（参见 [ACCEPTANCE §S6](ACCEPTANCE.md#s6--云端部署619cloud_deploymd)）：

```bash
# 1. 健康检查
curl -fsS https://api.example.com/health
# 预期：ok=true, storage=mongo, mongo=connected

# 2. 登录
curl -fsS -X POST https://api.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# 预期：code=0, data.token 非空

# 3. 环境列表（替换 <TOKEN>）
curl -fsS https://api.example.com/api/environments \
  -H "Authorization: Bearer <TOKEN>"

# 4. Mongo 持久化：重启 backend 后再次登录，用户仍在
sudo systemctl restart virtualbrowser-backend
curl -fsS -X POST https://api.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

| 检查项 | 预期 |
|--------|------|
| HTTPS `/health` | `ok: true` |
| `STORAGE_DRIVER=mongo` | 日志与 `/health` 一致 |
| 登录 API | 返回 token |
| 重启后用户仍在 | Mongo 持久化生效 |
| CORS | 客户端 Origin 不被拦截 |
| 快照目录可写 | `DATA_DIR/profiles/` 有写权限 |

---

## 9. 常见问题

### Q1：`/health` 返回 `ok: false`，`mongo: disconnected`

- 检查 `MONGODB_URI` 用户名、密码、`authSource`
- 确认 `mongod` 运行且防火墙允许本机 27017
- 查看 backend 日志：`journalctl -u virtualbrowser-backend -f`

### Q2：登录 401 / 无法创建用户

- 确认请求走 HTTPS，Header 为 `Authorization: Bearer <token>`
- 首次部署检查种子用户是否写入（空库自动 seed）
- 生产环境如已改密，勿仍用默认 `admin123`

### Q3：快照上传 413 / 超时

- Nginx：`client_max_body_size 512m;`，`proxy_read_timeout 300s;`
- backend `main.ts` 已设 raw body limit `512mb`

### Q4：CORS 报错「Origin not allowed」

- 将客户端实际 Origin 加入 `CORS_ORIGINS`
- Electron `file://` 场景 Origin 可能为 `null`；可暂用 `*` 排障，再收紧
- 确认 Nginx 未剥离 `Origin` 请求头

### Q5：`STORAGE_DRIVER=local` 误用于生产

- `/health` 中 `storage` 将为 `local`，数据写入 SQLite 而非 Mongo
- **生产必须** `STORAGE_DRIVER=mongo`（见 [DELIVERY_STANDARD](DELIVERY_STANDARD.md)）

### Q6：多客户端连接同一云端

- 设计上支持：会话存 Mongo，环境按 `tenantId` / `ownerId` 隔离
- 确保 `DATA_DIR` 在共享存储或单机部署时磁盘足够
- Native 启动仍在各客户端本机（S7），云端只提供 API + 快照

### Q7：证书续期

```bash
sudo certbot renew --dry-run
sudo systemctl reload nginx
```

---

## 10. 交付物核对

| 交付物 | 路径 / 说明 |
|--------|-------------|
| 部署 SOP | 本文 `docs/CLOUD_DEPLOY.md` |
| 后端进程 | `server-backend` + systemd |
| 数据库 | MongoDB `virtualbrowser` 库 |
| 快照存储 | `DATA_DIR/profiles/` |
| HTTPS 入口 | Nginx `api.example.com` |
| 验收报告 | `docs/acceptance-reports/S6-*.md` |

**不在 S6 范围（后续阶段）：**

- S7 客户端安装包与 `client.json` API 基址注入
- S8 Compat API `:9000` 暴露（可选，见 [08-compat-api](modules/08-compat-api.md)）
- 生产 native 代理（见 [06-deployment §5 待办 6.3–6.4](modules/06-deployment.md)）

---

## 11. 相关文档

- [06-deployment — 模块部署总览](modules/06-deployment.md)
- [07-backend-stack — 双模式存储与 API](modules/07-backend-stack.md)
- [INTEGRATION — Deploy→All / Deploy→Client](INTEGRATION.md)
- [ACCEPTANCE — S6 验收步骤](ACCEPTANCE.md)
- [`server-backend/README.md`](../server-backend/README.md)
