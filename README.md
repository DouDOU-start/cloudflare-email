# cf-email

Self-hosted email receiver. Cloudflare Email Routing forwards messages through a thin Worker relay to a Go backend, which parses, filters, stores, and serves them through an admin web UI and tokenized viewer links.

- **Only receives**: sending email is out of scope.
- **Single-tenant**: one configured admin account.
- **Multi-domain**: any Cloudflare Email Routing domain can forward to the same backend.
- **Token share**: admin can generate `/v/<token>` links for read-only mailbox access.

## Architecture

```
sender -> Cloudflare Email Routing -> Worker (HMAC relay) -> Go backend
                                                              | SQLite (WAL)
                                                              | ./data/storage (attachments)
                                                              ` embedded React SPA
```

- **backend/**: Go service for ingest, admin API, viewer API, SQLite, attachment storage, and embedded SPA hosting.
- **web/**: React + Vite + TypeScript + Tailwind admin/viewer frontend.
- **worker/**: Cloudflare Email Worker that signs and forwards raw MIME to the backend.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Email entry | Cloudflare Email Routing + Email Worker |
| Backend | Go 1.25+, chi, `modernc.org/sqlite`, sqlc, goose |
| MIME parser | `github.com/jhillyerd/enmime` |
| Admin auth | Configured credentials, constant-time compare, signed session cookie |
| Frontend | React + Vite + TypeScript + Tailwind + TanStack Query |
| Container | Distroless multi-stage Dockerfile |

## Quick Start

```bash
make dev
```

`make dev` starts Vite on `http://localhost:5173` and the Go backend on `http://localhost:8080`. On first run it copies [backend/config.yaml.example](backend/config.yaml.example) to `backend/config.yaml`. Open `http://localhost:5173/admin` and log in with the default dev credentials from that config.

For a production-style local run with the frontend embedded into the backend binary path:

```bash
make run
```

## Configuration

The backend reads `backend/config.yaml` by default. Use `CONFIG_PATH` to point at another config file, or override individual fields with environment variables:

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

Important production values:

- `PUBLIC_BASE_URL` must match the public HTTPS origin that serves the backend.
- `INGEST_TOKEN` must be identical in the backend config and Worker secret.
- `INGEST_SECRET` must be identical in the backend config and Worker secret.
- `SESSION_SECRET` should be a long random value and stable across restarts.
- `ADMIN_PASSWORD` is stored in config as plaintext in the current implementation, so protect config file access.

## Build And Deploy

Build the embedded backend binary:

```bash
make backend-build
```

Build the container image from the repository root:

```bash
docker build -f backend/Dockerfile -t cf-email .
```

Run the Worker deploy after setting secrets:

```bash
cd worker
npx wrangler secret put INGEST_TOKEN
npx wrangler secret put INGEST_SECRET
npx wrangler secret put INGEST_URL
npx wrangler deploy
```

`INGEST_URL` should be `https://<your-domain>/ingest/email`. In Cloudflare Dashboard, enable Email Routing for each domain and route catch-all or selected addresses to the `cf-email-relay` Worker.

## Makefile Targets

```bash
make help          # list targets
make dev           # Vite HMR + Go backend
make run           # build SPA, embed it, run backend locally
make web-build     # build React SPA
make web-embed     # copy built SPA into backend/internal/web/dist
make backend-build # build backend binary to backend/bin/backend
make worker-deploy # deploy Cloudflare Worker
make clean         # remove build outputs
```

## Security Model

| Surface | Defense |
| --- | --- |
| Worker -> backend | HMAC-SHA256 signature + timestamp replay window |
| `/admin` login | Constant-time credential compare, per-IP rate limit, optional Turnstile |
| `/admin` session | HMAC-signed HttpOnly cookie, Secure outside local dev, SameSite=Strict |
| `/v/:token` | 256-bit random token stored as SHA-256 hash, constant-time compare, rate limit and ban window |
| HTML mail | Rendered in `sandbox=""` iframe with strict CSP; HTTPS and data images are allowed |
| Attachments | Stored on local filesystem and served only through authorized API paths |

## Data Layout

Runtime data is relative to the backend working directory unless configured otherwise:

```text
data/
├── email.db
├── email.db-wal
├── email.db-shm
└── storage/
    └── attachments/<message_id>/<index>-<filename>
```

Use SQLite backup tooling such as `.backup` for consistent database backups. Copy `data/storage` with the database backup so attachment paths remain valid.

## Project Layout

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

## License

Private / unlicensed.
