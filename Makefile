.PHONY: help web-build web-embed dev run backend-build worker-deploy clean

help:
	@echo "Targets:"
	@echo "  dev           HMR dev: Vite (:5173) + Go (:8080) — open http://localhost:5173/admin"
	@echo "  run           single-binary mode: rebuild SPA, embed, run Go (:8080) — closer to prod"
	@echo "  web-build     build React SPA"
	@echo "  web-embed     build SPA and copy into backend embed dir"
	@echo "  backend-build build Go backend binary to ./backend/bin/backend"
	@echo "  worker-deploy wrangler deploy the CF Email Worker"
	@echo "  clean         remove build outputs"

web-build:
	cd web && npm run build

web-embed: web-build
	rm -rf backend/internal/web/dist
	mkdir -p backend/internal/web/dist
	cp -r web/dist/. backend/internal/web/dist/
	touch backend/internal/web/dist/.gitkeep

# HMR development mode.
# - Vite dev server on :5173 hot-reloads frontend changes.
# - Go backend on :8080 serves the API; Vite proxies /api -> :8080 (vite.config.ts).
# - Reads backend/config.yaml for admin credentials and secrets.
#   First run will copy backend/config.yaml.example → backend/config.yaml.
# Backend changes still need a restart — Ctrl+C and run `make dev` again.
dev:
	@[ -f backend/config.yaml ] || (cp backend/config.yaml.example backend/config.yaml && echo "→ created backend/config.yaml from example")
	@echo "→ Vite (HMR):  http://localhost:5173"
	@echo "→ Go API:      http://localhost:8080"
	@echo "→ Open:        http://localhost:5173/admin   (creds in backend/config.yaml)"
	@trap 'kill 0' INT TERM EXIT; \
	(cd web && npm run dev) & \
	(cd backend && \
		PUBLIC_BASE_URL=http://localhost:5173 \
		DEV_INSECURE_COOKIE=1 \
		go run ./cmd/backend) & \
	wait

# Production-style local run: rebuild the SPA, embed it, run a single Go binary.
# Use this to verify the embedded bundle actually matches what you see, or to
# test against the same code path docker / production uses.
run: web-embed
	@[ -f backend/config.yaml ] || (cp backend/config.yaml.example backend/config.yaml && echo "→ created backend/config.yaml from example")
	cd backend && DEV_INSECURE_COOKIE=1 go run ./cmd/backend

backend-build: web-embed
	cd backend && go build -trimpath -ldflags="-s -w" -o bin/backend ./cmd/backend

worker-deploy:
	cd worker && npx wrangler deploy

clean:
	rm -rf backend/bin backend/internal/web/dist/* web/dist worker/dist worker/.wrangler
	touch backend/internal/web/dist/.gitkeep
