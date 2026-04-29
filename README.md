# cf-email

自托管邮件接收器。Cloudflare Email Routing 将邮件转发到 Worker，再由 Go 后端解析、过滤、存储，并提供管理后台和只读分享链接。

只接收邮件，不提供发信能力。

## 特性

- **Cloudflare Email Routing**：通过 Email Worker 接收任意已配置域名的邮件。
- **安全中继**：Worker 使用 Bearer Token、HMAC-SHA256 和时间戳签名转发 MIME。
- **单进程部署**：React 管理后台嵌入 Go 后端，生产环境只运行一个服务。
- **本地存储**：SQLite WAL 保存元数据，文件系统保存附件。
- **只读分享**：管理员可生成 `/v/<token>` 链接供外部查看指定邮箱。

## 架构

```text
sender -> Cloudflare Email Routing -> Worker -> Go backend
                                                | SQLite
                                                | attachments
                                                ` embedded SPA
```

| 目录 | 说明 |
| --- | --- |
| `backend/` | Go 后端、API、数据库、附件存储、内嵌前端。 |
| `web/` | React + Vite + TypeScript 管理端和查看端。 |
| `worker/` | Cloudflare Email Worker，中继原始 MIME。 |
| `deploy/` | Linux 二进制安装脚本。 |

## 部署后端

安装到 Linux + systemd 服务器：

```bash
curl -fsSL https://raw.githubusercontent.com/DouDOU-start/cloudflare-email/master/deploy/install.sh | sudo bash
```

安装后主要文件：

```text
/opt/cf-email/cf-email              # 后端二进制
/etc/cf-email/config.yaml           # 配置和密钥
/var/lib/cf-email/data/email.db      # SQLite 数据库
/var/lib/cf-email/storage/           # 附件
/etc/systemd/system/cf-email.service # systemd 服务
```

## 部署 Worker

Worker 单独部署。把后端配置里的 `ingest_token`、`ingest_secret` 和后端公网摄入地址写入 Worker secrets：

```bash
cd worker
npx wrangler secret put INGEST_URL
npx wrangler secret put INGEST_TOKEN
npx wrangler secret put INGEST_SECRET
npx wrangler deploy
```

`INGEST_URL` 是后端摄入接口：

```text
https://<backend-domain>/ingest/email
```

然后在 Cloudflare Dashboard 中启用 Email Routing，并把 catch-all 或指定地址路由到 `cf-email-relay` Worker。

## 配置

后端默认读取当前工作目录的 `config.yaml`，也可以用 `CONFIG_PATH` 指定配置文件。常用字段都支持环境变量覆盖：

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

生产环境至少需要确认：

- `PUBLIC_BASE_URL` 默认是 `http://localhost:8080`，生产环境建议改成公网 HTTPS 地址。
- `INGEST_TOKEN` 和 `INGEST_SECRET` 与 Worker secrets 一致。
- `SESSION_SECRET` 是稳定的长随机值。
- `ADMIN_PASSWORD` 当前明文保存在配置中，需要保护配置文件权限。

## 本地开发

```bash
make dev           # Vite HMR + Go 后端
make run           # 构建前端并由后端托管
make backend-build # 构建内嵌前端的后端二进制
make worker-deploy # 部署 Cloudflare Worker
```

`make dev` 会启动 `http://localhost:5173` 和 `http://localhost:8080`。首次运行会复制 [backend/config.yaml.example](backend/config.yaml.example) 到 `backend/config.yaml`。

## 运维

```bash
sudo bash deploy/install.sh status
sudo bash deploy/install.sh logs
sudo bash deploy/install.sh upgrade
sudo bash deploy/install.sh uninstall -y
sudo bash deploy/install.sh uninstall --purge -y
```

`uninstall` 默认保留配置和数据，`--purge` 会删除 `/etc/cf-email` 和 `/var/lib/cf-email`。

备份配置和数据：

```bash
sudo cp /etc/cf-email/config.yaml ./config.yaml.backup
sudo tar -czf cf-email-data.tar.gz -C /var/lib cf-email
```

## 安全模型

| 暴露面 | 防护 |
| --- | --- |
| Worker -> 后端 | Bearer Token + HMAC-SHA256 + 时间戳重放窗口 |
| `/admin` 登录 | 常量时间凭据比较、按 IP 限流、可选 Turnstile |
| `/admin` 会话 | HMAC 签名 HttpOnly Cookie |
| `/v/:token` | 256 位随机令牌，SHA-256 哈希存储，常量时间比较 |
| HTML 邮件 | `sandbox=""` iframe + CSP |
| 附件 | 仅通过授权 API 访问本地文件 |

## 许可证

私有 / 未授权。
