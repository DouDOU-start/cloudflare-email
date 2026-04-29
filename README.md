# cf-email

自托管邮件接收器。Cloudflare Email Routing 将邮件转发到轻量 Worker 中继，再由 Go 后端完成解析、过滤、存储，并通过管理后台和带令牌的查看链接提供访问。

- **只接收邮件**：不包含发信能力。
- **单租户**：使用一个已配置的管理员账号。
- **多域名**：任意 Cloudflare Email Routing 域名都可以转发到同一个后端。
- **令牌分享**：管理员可以生成 `/v/<token>` 链接，提供只读邮箱访问。

## 架构

```text
sender -> Cloudflare Email Routing -> Worker (HMAC relay) -> Go backend
                                                              | SQLite (WAL)
                                                              | ./data/storage (attachments)
                                                              ` embedded React SPA
```

- **backend/**：Go 服务，负责邮件摄入、管理 API、查看 API、SQLite、附件存储和内嵌 SPA 托管。
- **web/**：React + Vite + TypeScript + Tailwind 管理端和查看端前端。
- **worker/**：Cloudflare Email Worker，负责签名并转发原始 MIME 到后端。

## 技术栈

| 层级 | 选型 |
| --- | --- |
| 邮件入口 | Cloudflare Email Routing + Email Worker |
| 后端 | Go 1.25+、chi、`modernc.org/sqlite`、sqlc、goose |
| MIME 解析 | `github.com/jhillyerd/enmime` |
| 管理认证 | 配置凭据、常量时间比较、签名会话 Cookie |
| 前端 | React + Vite + TypeScript + Tailwind + TanStack Query |
| 容器 | Distroless 多阶段 Dockerfile |

## 快速开始

```bash
make dev
```

`make dev` 会在 `http://localhost:5173` 启动 Vite，并在 `http://localhost:8080` 启动 Go 后端。首次运行时会把 [backend/config.yaml.example](backend/config.yaml.example) 复制为 `backend/config.yaml`。打开 `http://localhost:5173/admin`，使用该配置里的默认开发账号登录。

需要以接近生产的方式在本地运行，并将前端嵌入后端二进制路径时：

```bash
make run
```

## 配置

后端默认读取 `backend/config.yaml`。可以使用 `CONFIG_PATH` 指向其他配置文件，也可以通过环境变量覆盖单个字段：

```bash
BIND_ADDR=:8080
PUBLIC_BASE_URL=https://mail.example.com
DB_PATH=./data/email.db
STORAGE_DIR=./data/storage
INGEST_TOKEN=<worker-bearer-token>
INGEST_SECRET=<shared-worker-secret>
SESSION_SECRET=<session-cookie-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

生产环境的重要配置：

- `PUBLIC_BASE_URL` 必须匹配对外提供后端服务的 HTTPS 源站。
- `INGEST_TOKEN` 必须和 Worker secret 中的值一致。
- `INGEST_SECRET` 必须和 Worker secret 中的值一致。
- `SESSION_SECRET` 应该是较长的随机值，并在重启之间保持稳定。
- 当前实现中 `ADMIN_PASSWORD` 以明文存储在配置中，因此需要保护配置文件的访问权限。

## 构建与部署

构建内嵌前端的后端二进制：

```bash
make backend-build
```

在仓库根目录构建容器镜像：

```bash
docker build -f backend/Dockerfile -t cf-email .
```

设置 secrets 后部署 Worker：

```bash
cd worker
npx wrangler secret put INGEST_TOKEN
npx wrangler secret put INGEST_SECRET
npx wrangler secret put INGEST_URL
npx wrangler deploy
```

`INGEST_URL` 应为 `https://<your-domain>/ingest/email`。在 Cloudflare Dashboard 中，为每个域名启用 Email Routing，并将 catch-all 或指定地址路由到 `cf-email-relay` Worker。

## Makefile 目标

```bash
make help          # 列出目标
make dev           # Vite HMR + Go 后端
make run           # 构建 SPA、嵌入后端并在本地运行
make web-build     # 构建 React SPA
make web-embed     # 将构建后的 SPA 复制到 backend/internal/web/dist
make backend-build # 将后端二进制构建到 backend/bin/backend
make worker-deploy # 部署 Cloudflare Worker
make clean         # 删除构建产物
```

## 安全模型

| 暴露面 | 防护 |
| --- | --- |
| Worker -> 后端 | HMAC-SHA256 签名 + 时间戳重放窗口 |
| `/admin` 登录 | 常量时间凭据比较、按 IP 限流、可选 Turnstile |
| `/admin` 会话 | HMAC 签名 HttpOnly Cookie，本地开发外启用 Secure，SameSite=Strict |
| `/v/:token` | 256 位随机令牌，以 SHA-256 哈希存储，常量时间比较，限流和封禁窗口 |
| HTML 邮件 | 在 `sandbox=""` iframe 中渲染，并使用严格 CSP；允许 HTTPS 和 data 图片 |
| 附件 | 存储在本地文件系统，只能通过已授权 API 路径访问 |

## 数据布局

除非另行配置，运行时数据路径相对于后端工作目录：

```text
data/
├── email.db
├── email.db-wal
├── email.db-shm
└── storage/
    └── attachments/<message_id>/<index>-<filename>
```

使用 SQLite 的 `.backup` 等备份工具进行一致性数据库备份。备份数据库时同时复制 `data/storage`，确保附件路径仍然有效。

## 项目结构

```text
cf-email/
├── backend/
│   ├── cmd/backend/
│   ├── internal/
│   │   ├── api/admin/
│   │   ├── api/viewer/
│   │   ├── auth/
│   │   ├── config/
│   │   ├── db/
│   │   ├── httpapi/
│   │   ├── ingest/
│   │   ├── mime/
│   │   ├── ratelimit/
│   │   ├── storage/
│   │   └── web/
│   └── sqlc.yaml
├── web/
│   └── src/{admin,viewer,components,lib}
└── worker/
    └── src/index.ts
```

## 许可证

私有 / 未授权。
