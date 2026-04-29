#!/usr/bin/env bash
set -Eeuo pipefail

REPO_OWNER="DouDOU-start"
REPO_NAME="cloudflare-email"
APP_NAME="cf-email"
SERVICE_NAME="cf-email"
INSTALL_DIR="${CF_EMAIL_INSTALL_DIR:-${INSTALL_DIR:-/opt/cf-email}}"
CONFIG_FILE=""
DATA_DIR=""
STORAGE_DIR=""
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
GITHUB_REPO="${REPO_OWNER}/${REPO_NAME}"
GITHUB_API="https://api.github.com/repos/${GITHUB_REPO}"
GITHUB_RELEASES="https://github.com/${GITHUB_REPO}/releases/download"
DEFAULT_PUBLIC_BASE_URL="http://localhost:8080"

COMMAND="install"
VERSION=""
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-}"
TURNSTILE_SECRET_KEY="${TURNSTILE_SECRET_KEY:-}"
ASSUME_YES=0
PURGE=0
INSTALL_DIR_SET=0

log() { printf '[%s] %s\n' "$APP_NAME" "$*"; }
die() { printf '[%s] ERROR: %s\n' "$APP_NAME" "$*" >&2; exit 1; }

set_layout_paths() {
  INSTALL_DIR="${INSTALL_DIR%/}"
  CONFIG_FILE="${INSTALL_DIR}/config.yaml"
  DATA_DIR="${INSTALL_DIR}/data"
  STORAGE_DIR="${INSTALL_DIR}/storage"
}

set_layout_paths

usage() {
  cat <<'EOF'
Usage:
  install.sh [install] [--install-dir DIR] [--public-base-url URL] [--version VERSION]
  install.sh upgrade [--install-dir DIR] [--version VERSION]
  install.sh start|stop|pause|restart
  install.sh uninstall [-y] [--purge]
  install.sh status
  install.sh logs
  install.sh help

Examples:
  curl -fsSL https://raw.githubusercontent.com/DouDOU-start/cloudflare-email/master/deploy/install.sh | sudo bash
  curl -fsSL https://raw.githubusercontent.com/DouDOU-start/cloudflare-email/master/deploy/install.sh | sudo bash -s -- --install-dir /srv/cf-email
  sudo bash install.sh install --version v0.1.0
  sudo bash install.sh install --public-base-url https://mail.example.com
  sudo bash install.sh restart
  sudo bash install.sh upgrade
  sudo bash install.sh uninstall -y
EOF
}

parse_args() {
  if [[ $# -gt 0 ]]; then
    case "$1" in
      install|upgrade|update|uninstall|remove|start|stop|pause|restart|status|logs|help|-h|--help)
        COMMAND="$1"
        shift
        ;;
    esac
  fi

  case "$COMMAND" in
    update) COMMAND="upgrade" ;;
    remove) COMMAND="uninstall" ;;
    -h|--help) COMMAND="help" ;;
  esac

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -v|--version)
        [[ $# -ge 2 ]] || die "--version requires a value"
        VERSION="$2"
        shift 2
        ;;
      --version=*)
        VERSION="${1#*=}"
        shift
        ;;
      --domain|--public-base-url)
        [[ $# -ge 2 ]] || die "$1 requires a value"
        PUBLIC_BASE_URL="$2"
        shift 2
        ;;
      --domain=*|--public-base-url=*)
        PUBLIC_BASE_URL="${1#*=}"
        shift
        ;;
      --install-dir|--dir)
        [[ $# -ge 2 ]] || die "$1 requires a value"
        INSTALL_DIR="$2"
        INSTALL_DIR_SET=1
        set_layout_paths
        shift 2
        ;;
      --install-dir=*|--dir=*)
        INSTALL_DIR="${1#*=}"
        INSTALL_DIR_SET=1
        set_layout_paths
        shift
        ;;
      -y|--yes)
        ASSUME_YES=1
        shift
        ;;
      --purge)
        PURGE=1
        shift
        ;;
      help|-h|--help)
        COMMAND="help"
        shift
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done

  if [[ -n "$VERSION" && "$VERSION" != v* ]]; then
    VERSION="v${VERSION}"
  fi
}

is_interactive() {
  [[ -t 0 || -r /dev/tty ]]
}

ensure_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    return
  fi
  command -v sudo >/dev/null 2>&1 || die "please run as root or install sudo"
  if [[ -r "$0" && "$0" != "bash" && "$0" != "sh" ]]; then
    exec sudo -E bash "$0" "$@"
  fi
  die "please run the installer with sudo, for example: curl -fsSL ... | sudo bash"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

check_system() {
  [[ "$(uname -s)" == "Linux" ]] || die "only Linux is supported"
  [[ -d /run/systemd/system ]] || die "systemd is required"
  require_command curl
  require_command tar
  require_command sha256sum
  require_command systemctl
}

validate_install_dir() {
  [[ -n "$INSTALL_DIR" ]] || die "install dir is required"
  [[ "$INSTALL_DIR" == /* ]] || die "install dir must be an absolute path"
  [[ "$INSTALL_DIR" != "/" ]] || die "install dir cannot be /"
  [[ "$INSTALL_DIR" != *[[:space:]]* ]] || die "install dir cannot contain whitespace"
  set_layout_paths
}

resolve_existing_install_dir() {
  [[ -f "$SERVICE_FILE" ]] || return
  local exec_start
  exec_start="$(grep -m1 '^ExecStart=' "$SERVICE_FILE" | cut -d '=' -f2-)"
  [[ -n "$exec_start" ]] || return
  [[ "${exec_start##*/}" == "cf-email" ]] || return
  INSTALL_DIR="${exec_start%/cf-email}"
  set_layout_paths
}

prepare_layout() {
  if [[ "$COMMAND" == "install" ]]; then
    if [[ "$INSTALL_DIR_SET" -eq 0 ]]; then
      INSTALL_DIR="$(prompt_value 'Install directory' "$INSTALL_DIR")"
    fi
    validate_install_dir
    return
  fi

  if [[ "$INSTALL_DIR_SET" -eq 0 ]]; then
    resolve_existing_install_dir
  fi
  validate_install_dir
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64' ;;
    aarch64|arm64) printf 'arm64' ;;
    *) die "unsupported architecture: $(uname -m)" ;;
  esac
}

latest_version() {
  curl -fsSL "${GITHUB_API}/releases/latest" | grep -m1 '"tag_name"' | cut -d '"' -f4
}

resolve_version() {
  if [[ -n "$VERSION" ]]; then
    printf '%s' "$VERSION"
    return
  fi
  local latest
  latest="$(latest_version)"
  [[ -n "$latest" ]] || die "failed to resolve latest release version"
  printf '%s' "$latest"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
    return
  fi
  require_command base64
  head -c 32 /dev/urandom | base64
}

prompt_value() {
  local label="$1"
  local default_value="$2"
  local value=""

  if ! is_interactive; then
    printf '%s' "$default_value"
    return
  fi

  if [[ -n "$default_value" ]]; then
    printf '%s [%s]: ' "$label" "$default_value" >/dev/tty
  else
    printf '%s: ' "$label" >/dev/tty
  fi
  IFS= read -r value </dev/tty || true
  if [[ -z "$value" ]]; then
    value="$default_value"
  fi
  printf '%s' "$value"
}

normalize_base_url() {
  local value="$1"
  value="${value%/}"
  [[ "$value" =~ ^https?://[^[:space:]]+$ ]] || die "PUBLIC_BASE_URL must start with http:// or https://"
  printf '%s' "$value"
}

yaml_quote() {
  local value="$1"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "config values must be single-line strings"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

collect_config() {
  if [[ -z "$PUBLIC_BASE_URL" ]]; then
    PUBLIC_BASE_URL="$DEFAULT_PUBLIC_BASE_URL"
  fi
  PUBLIC_BASE_URL="$(normalize_base_url "$PUBLIC_BASE_URL")"

  ADMIN_USERNAME="$(prompt_value 'Admin username' "$ADMIN_USERNAME")"
  [[ -n "$ADMIN_USERNAME" ]] || die "admin username is required"

  if [[ -z "$ADMIN_PASSWORD" ]]; then
    local generated_password
    generated_password="$(random_secret)"
    ADMIN_PASSWORD="$(prompt_value 'Admin password' "$generated_password")"
  fi
  [[ -n "$ADMIN_PASSWORD" ]] || die "admin password is required"

  TURNSTILE_SITE_KEY="$(prompt_value 'Turnstile site key, optional' "$TURNSTILE_SITE_KEY")"
  TURNSTILE_SECRET_KEY="$(prompt_value 'Turnstile secret key, optional' "$TURNSTILE_SECRET_KEY")"
}

create_user() {
  if ! getent group "$SERVICE_NAME" >/dev/null; then
    groupadd --system "$SERVICE_NAME"
  fi
  if ! id -u "$SERVICE_NAME" >/dev/null 2>&1; then
    useradd --system --gid "$SERVICE_NAME" --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_NAME"
  fi
}

prepare_dirs() {
  install -d -m 0755 "$INSTALL_DIR"
  install -d -m 0750 -o "$SERVICE_NAME" -g "$SERVICE_NAME" "$DATA_DIR"
  install -d -m 0750 -o "$SERVICE_NAME" -g "$SERVICE_NAME" "$STORAGE_DIR"
}

download_release() {
  local version="$1"
  local arch="$2"
  local tmpdir="$3"
  local asset="cf-email_linux_${arch}.tar.gz"
  local asset_url="${GITHUB_RELEASES}/${version}/${asset}"
  local checksum_url="${GITHUB_RELEASES}/${version}/checksums.txt"

  log "downloading ${asset} from ${version}"
  curl -fL --retry 3 --connect-timeout 10 -o "${tmpdir}/${asset}" "$asset_url"
  curl -fL --retry 3 --connect-timeout 10 -o "${tmpdir}/checksums.txt" "$checksum_url"

  (cd "$tmpdir" && grep "  ${asset}$" checksums.txt | sha256sum -c -) || die "checksum verification failed for ${asset}"
  tar -xzf "${tmpdir}/${asset}" -C "$tmpdir"
  [[ -x "${tmpdir}/cf-email" ]] || die "release archive does not contain executable cf-email"
}

install_binary() {
  local source_binary="$1"
  local backup=""
  if [[ -x "${INSTALL_DIR}/cf-email" ]]; then
    backup="${INSTALL_DIR}/cf-email.backup.$(date +%Y%m%d%H%M%S)"
    cp "${INSTALL_DIR}/cf-email" "$backup"
    log "backup created: ${backup}"
  fi
  install -m 0755 "$source_binary" "${INSTALL_DIR}/cf-email"
}

write_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    log "keeping existing config: ${CONFIG_FILE}"
    return
  fi

  local ingest_token ingest_secret session_secret
  ingest_token="$(random_secret)"
  ingest_secret="$(random_secret)"
  session_secret="$(random_secret)"

  umask 077
  cat >"$CONFIG_FILE" <<EOF
bind_addr: ":8080"
public_base_url: $(yaml_quote "$PUBLIC_BASE_URL")
db_path: $(yaml_quote "${DATA_DIR}/email.db")
storage_dir: $(yaml_quote "$STORAGE_DIR")

ingest_token: $(yaml_quote "$ingest_token")
ingest_secret: $(yaml_quote "$ingest_secret")
session_secret: $(yaml_quote "$session_secret")

admin:
  username: $(yaml_quote "$ADMIN_USERNAME")
  password: $(yaml_quote "$ADMIN_PASSWORD")

turnstile:
  site_key: $(yaml_quote "$TURNSTILE_SITE_KEY")
  secret_key: $(yaml_quote "$TURNSTILE_SECRET_KEY")
EOF
  chown "$SERVICE_NAME":"$SERVICE_NAME" "$CONFIG_FILE"
  chmod 0640 "$CONFIG_FILE"
}

write_service() {
  cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=cf-email self-hosted mail receiver
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_NAME}
Group=${SERVICE_NAME}
WorkingDirectory=${INSTALL_DIR}
Environment=CONFIG_PATH=${CONFIG_FILE}
ExecStart=${INSTALL_DIR}/cf-email
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${CONFIG_FILE} ${DATA_DIR} ${STORAGE_DIR}

[Install]
WantedBy=multi-user.target
EOF
  chmod 0644 "$SERVICE_FILE"
  systemctl daemon-reload
}

start_service() {
  systemctl enable --now "$SERVICE_NAME"
}

verify_service() {
  local i
  for i in {1..20}; do
    if curl -fsS http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
      log "service is healthy"
      return
    fi
    sleep 1
  done
  systemctl status "$SERVICE_NAME" --no-pager || true
  return 1
}

config_value() {
  local key="$1"
  grep "^${key}:" "$CONFIG_FILE" | sed "s/^${key}:[[:space:]]*\"//; s/\"$//"
}

nested_config_value() {
  local key="$1"
  grep "^[[:space:]]*${key}:" "$CONFIG_FILE" | head -n1 | sed "s/^[[:space:]]*${key}:[[:space:]]*\"//; s/\"$//"
}

print_summary() {
  local public_base_url admin_username admin_password ingest_token ingest_secret
  public_base_url="$(config_value public_base_url)"
  admin_username="$(nested_config_value username)"
  admin_password="$(nested_config_value password)"
  ingest_token="$(config_value ingest_token)"
  ingest_secret="$(config_value ingest_secret)"

  cat <<EOF

cf-email installed successfully.

Install directory: ${INSTALL_DIR}
Config file: ${CONFIG_FILE}
Admin URL: ${public_base_url}/admin
Admin username: ${admin_username}
Admin password: ${admin_password}

Worker deployment values:
INGEST_URL=${public_base_url}/ingest/email
INGEST_TOKEN=${ingest_token}
INGEST_SECRET=${ingest_secret}

Deploy the Worker separately with wrangler after setting these secrets.

Commands:
sudo bash install.sh start
sudo bash install.sh stop
sudo bash install.sh restart
sudo bash install.sh status
sudo bash install.sh logs
EOF
}

do_install() {
  check_system
  if [[ -x "${INSTALL_DIR}/cf-email" ]]; then
    die "cf-email is already installed; use upgrade instead"
  fi
  create_user
  prepare_dirs
  collect_config

  local version arch tmpdir
  version="$(resolve_version)"
  arch="$(detect_arch)"
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"; trap - RETURN' RETURN

  download_release "$version" "$arch" "$tmpdir"
  install_binary "${tmpdir}/cf-email"
  write_config
  write_service
  start_service
  verify_service || die "service did not become healthy"
  print_summary
}

do_upgrade() {
  check_system
  [[ -x "${INSTALL_DIR}/cf-email" ]] || die "cf-email is not installed"

  local version arch tmpdir previous
  version="$(resolve_version)"
  arch="$(detect_arch)"
  tmpdir="$(mktemp -d)"
  previous="${INSTALL_DIR}/cf-email.backup.$(date +%Y%m%d%H%M%S)"
  trap 'rm -rf "$tmpdir"; trap - RETURN' RETURN

  download_release "$version" "$arch" "$tmpdir"
  cp "${INSTALL_DIR}/cf-email" "$previous"
  install -m 0755 "${tmpdir}/cf-email" "${INSTALL_DIR}/cf-email"
  systemctl restart "$SERVICE_NAME"
  if ! verify_service; then
    cp "$previous" "${INSTALL_DIR}/cf-email"
    systemctl restart "$SERVICE_NAME" || true
    die "upgrade failed; rolled back to ${previous}"
  fi
  log "upgraded to ${version}"
}

confirm_uninstall() {
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    return
  fi
  is_interactive || die "uninstall requires -y in non-interactive mode"
  printf 'Uninstall cf-email? Type yes to continue: ' >/dev/tty
  local answer
  IFS= read -r answer </dev/tty || true
  [[ "$answer" == "yes" ]] || die "uninstall cancelled"
}

do_uninstall() {
  check_system
  confirm_uninstall
  systemctl disable --now "$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload
  rm -f "${INSTALL_DIR}/cf-email" "${INSTALL_DIR}"/cf-email.backup.*

  if [[ "$PURGE" -eq 1 ]]; then
    rm -rf "$INSTALL_DIR"
    userdel "$SERVICE_NAME" >/dev/null 2>&1 || true
    groupdel "$SERVICE_NAME" >/dev/null 2>&1 || true
    log "uninstalled and purged ${INSTALL_DIR}"
  else
    log "uninstalled; config and data kept at ${INSTALL_DIR}"
  fi
}

do_start() {
  systemctl enable --now "$SERVICE_NAME"
}

do_stop() {
  systemctl stop "$SERVICE_NAME"
}

do_restart() {
  systemctl restart "$SERVICE_NAME"
}

do_status() {
  systemctl status "$SERVICE_NAME" --no-pager
}

do_logs() {
  journalctl -u "$SERVICE_NAME" -n 200 --no-pager
}

main() {
  parse_args "$@"
  if [[ "$COMMAND" == "help" ]]; then
    usage
    exit 0
  fi
  ensure_root "$@"
  prepare_layout

  case "$COMMAND" in
    install) do_install ;;
    upgrade) do_upgrade ;;
    uninstall) do_uninstall ;;
    start) do_start ;;
    stop|pause) do_stop ;;
    restart) do_restart ;;
    status) do_status ;;
    logs) do_logs ;;
    *) die "unknown command: ${COMMAND}" ;;
  esac
}

main "$@"
