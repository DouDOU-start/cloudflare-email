# ---- stage 1: build web ----
FROM node:22-alpine AS webbuild
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- stage 2: build go ----
FROM golang:1.25-alpine AS gobuild
WORKDIR /src
COPY backend/go.mod backend/go.sum* ./
RUN go mod download
COPY backend/ ./
# Copy compiled web assets into the embed directory
COPY --from=webbuild /web/dist ./internal/web/dist
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /out/backend ./cmd/backend

# ---- stage 3: runtime ----
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=gobuild /out/backend /app/backend
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/backend"]
