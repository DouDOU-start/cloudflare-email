# cf-email

自托管邮件接收器。Cloudflare Email Routing 将邮件转发到 Worker，再由后端保存并提供管理后台和只读分享链接。

只接收邮件，不提供发信能力。

## 特性

- **Cloudflare Email Routing**：通过 Email Worker 接收任意已配置域名的邮件。
- **管理后台**：查看邮箱、邮件、附件和访问链接。
- **只读分享**：为指定邮箱生成 `/v/<token>` 链接，外部用户无需管理员账号即可查看。
- **单机部署**：后端、管理后台和本地数据放在同一台 Linux 服务器上。

## 架构

```text
sender -> Cloudflare Email Routing -> Worker -> Go backend
                                                | data
                                                ` admin / viewer
```

| 目录 | 说明 |
| --- | --- |
| `backend/` | Go 后端、API、数据库和内嵌前端。 |
| `web/` | React + Vite + TypeScript 管理端和查看端。 |
| `worker/` | Cloudflare Email Worker。 |
| `deploy/` | Linux 安装脚本。 |

## 部署后端

在 Linux + systemd 服务器上运行安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/DouDOU-start/cloudflare-email/master/deploy/install.sh | sudo bash
```

默认安装到 `/opt/cf-email`，HTTP 端口默认 `8080`。安装完成后，终端会输出：

- 管理后台地址、管理员用户名和密码。
- Worker 需要配置的 `INGEST_URL`、`INGEST_TOKEN`、`INGEST_SECRET`。

主要文件位置：

```text
/opt/cf-email/cf-email              # 后端二进制
/opt/cf-email/data/config.yaml      # 配置和密钥
/opt/cf-email/data/email.db          # SQLite 数据库
/opt/cf-email/storage/               # 邮件原文和附件
/usr/local/bin/cf-email              # 管理命令
/etc/systemd/system/cf-email.service # systemd 服务
```

## 部署 Worker

进入 `worker/` 目录，把安装脚本输出的三个参数写入 Wrangler secrets：

```bash
cd worker
npx wrangler secret put INGEST_URL
npx wrangler secret put INGEST_TOKEN
npx wrangler secret put INGEST_SECRET
npx wrangler deploy
```

然后在 Cloudflare Dashboard 中启用 Email Routing，把 catch-all 或指定地址路由到 `cf-email-relay` Worker。

`INGEST_URL` 格式如下，通常直接使用安装脚本输出的值：

```text
https://<backend-domain>/ingest/email
```

## 使用后台

打开安装脚本输出的管理后台地址，使用管理员用户名和密码登录。

- 向已路由到 Worker 的域名发送邮件后，后台会自动出现对应邮箱和邮件。
- 在“邮箱”页面查看邮件、下载附件或下载 `.eml` 原文。
- 在“访问链接”页面为指定邮箱创建只读链接，并把链接分享给外部用户。
- 在“系统设置”页面查看或调整 Worker 调用后端所需的配置。

## 配置覆盖

安装部署通常不需要手动改配置。需要覆盖配置时，可以用 `CONFIG_PATH` 指定配置文件，或使用环境变量：

```bash
BIND_ADDR=:8080
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

生产环境至少确认：

- `INGEST_TOKEN` 和 `INGEST_SECRET` 与 Worker secrets 一致。
- `SESSION_SECRET` 是稳定的长随机值。
- 保护好 `config.yaml`，其中包含管理员密码和 Worker 密钥。

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
cf-email start
cf-email stop
cf-email restart
cf-email status
cf-email logs
cf-email update
cf-email uninstall -y
cf-email uninstall --purge -y
```

`logs` 默认跟踪最近 200 行日志，也可以传入 `journalctl` 参数，例如 `cf-email logs -n 500 --no-pager`。`uninstall` 默认只移除服务、二进制和管理命令，保留程序目录中的配置和数据；`--purge` 会删除整个程序目录。

备份配置和数据：

```bash
sudo cp /opt/cf-email/data/config.yaml ./config.yaml.backup
sudo tar -czf cf-email-data.tar.gz -C /opt cf-email
```
