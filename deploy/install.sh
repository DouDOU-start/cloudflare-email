#!/usr/bin/env bash
set -Eeuo pipefail

REPO_OWNER="DouDOU-start"
REPO_NAME="cloudflare-email"
APP_NAME="cf-email"
SERVICE_NAME="cf-email"
INSTALL_DIR="${CF_EMAIL_INSTALL_DIR:-${INSTALL_DIR:-/opt/cf-email}}"
CONFIG_FILE=""
LEGACY_CONFIG_FILE=""
DATA_DIR=""
STORAGE_DIR=""
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
COMMAND_FILE="/usr/local/bin/${APP_NAME}"
GITHUB_REPO="${REPO_OWNER}/${REPO_NAME}"
GITHUB_API="https://api.github.com/repos/${GITHUB_REPO}"
GITHUB_RELEASES="https://github.com/${GITHUB_REPO}/releases/download"
INSTALLER_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/master/deploy/install.sh"
DEFAULT_PORT="8080"

COMMAND="install"
VERSION=""
PORT="${PORT:-}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-}"
TURNSTILE_SECRET_KEY="${TURNSTILE_SECRET_KEY:-}"
ASSUME_YES=0
PURGE=0
INSTALL_DIR_SET=0

log() { printf '[%s] %s\n' "$APP_NAME" "$*"; }
die() { printf '[%s] 错误: %s\n' "$APP_NAME" "$*" >&2; exit 1; }

CURRENT_STEP=""
set_step() {
  CURRENT_STEP="$*"
  log "$CURRENT_STEP"
}

on_error() {
  local status="$?"
  if [[ -n "$CURRENT_STEP" ]]; then
    printf '[%s] 错误: %s 失败，退出码 %s\n' "$APP_NAME" "$CURRENT_STEP" "$status" >&2
  else
    printf '[%s] 错误: 安装脚本执行失败，退出码 %s\n' "$APP_NAME" "$status" >&2
  fi
  exit "$status"
}

trap on_error ERR

set_layout_paths() {
  INSTALL_DIR="${INSTALL_DIR%/}"
  DATA_DIR="${INSTALL_DIR}/data"
  CONFIG_FILE="${DATA_DIR}/config.yaml"
  LEGACY_CONFIG_FILE="${INSTALL_DIR}/config.yaml"
  STORAGE_DIR="${INSTALL_DIR}/storage"
}

set_layout_paths

usage() {
  cat <<'EOF'
用法:
  install.sh [install] [--install-dir DIR] [--port PORT] [--version VERSION]
  install.sh upgrade [--install-dir DIR] [--version VERSION]
  install.sh start|stop|pause|restart
  install.sh uninstall [-y] [--purge]
  install.sh status
  install.sh logs
  install.sh help

示例:
  curl -fsSL https://raw.githubusercontent.com/DouDOU-start/cloudflare-email/master/deploy/install.sh | sudo bash
  curl -fsSL https://raw.githubusercontent.com/DouDOU-start/cloudflare-email/master/deploy/install.sh | sudo bash -s -- --install-dir /srv/cf-email --port 8081
  sudo bash install.sh install --version v0.1.0
  cf-email restart
  cf-email update
  cf-email uninstall -y
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
        [[ $# -ge 2 ]] || die "--version 需要指定值"
        VERSION="$2"
        shift 2
        ;;
      --version=*)
        VERSION="${1#*=}"
        shift
        ;;
      --port)
        [[ $# -ge 2 ]] || die "--port 需要指定值"
        PORT="$2"
        shift 2
        ;;
      --port=*)
        PORT="${1#*=}"
        shift
        ;;
      --install-dir|--dir)
        [[ $# -ge 2 ]] || die "$1 需要指定值"
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
        die "未知参数: $1"
        ;;
    esac
  done

  if [[ -n "$VERSION" && "$VERSION" != v* ]]; then
    VERSION="v${VERSION}"
  fi
}

is_interactive() {
  if [[ -t 0 ]]; then
    return 0
  fi
  if { : >/dev/tty; } 2>/dev/null; then
    return 0
  fi
  return 1
}

ensure_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    return
  fi
  command -v sudo >/dev/null 2>&1 || die "请使用 root 运行，或先安装 sudo"
  if [[ -r "$0" && "$0" != "bash" && "$0" != "sh" ]]; then
    exec sudo -E bash "$0" "$@"
  fi
  die "请使用 sudo 运行安装脚本，例如：curl -fsSL ... | sudo bash"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少必需命令: $1"
}

check_system() {
  [[ "$(uname -s)" == "Linux" ]] || die "仅支持 Linux"
  [[ -d /run/systemd/system ]] || die "需要 systemd"
  require_command curl
  require_command tar
  require_command sha256sum
  require_command systemctl
}

validate_install_dir() {
  [[ -n "$INSTALL_DIR" ]] || die "安装目录不能为空"
  [[ "$INSTALL_DIR" == /* ]] || die "安装目录必须是绝对路径"
  [[ "$INSTALL_DIR" != "/" ]] || die "安装目录不能是 /"
  [[ "$INSTALL_DIR" != *[[:space:]]* ]] || die "安装目录不能包含空白字符"
  set_layout_paths
}

resolve_existing_install_dir() {
  [[ -f "$SERVICE_FILE" ]] || return 0
  local exec_start
  exec_start="$(grep -m1 '^ExecStart=' "$SERVICE_FILE" | cut -d '=' -f2-)"
  [[ -n "$exec_start" ]] || return 0
  [[ "${exec_start##*/}" == "cf-email" ]] || return 0
  INSTALL_DIR="${exec_start%/cf-email}"
  set_layout_paths
}

prepare_layout() {
  if [[ "$COMMAND" == "install" ]]; then
    if [[ "$INSTALL_DIR_SET" -eq 0 ]]; then
      INSTALL_DIR="$(prompt_value '安装目录' "$INSTALL_DIR")"
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
    *) die "不支持的系统架构: $(uname -m)" ;;
  esac
}

latest_version() {
  local response line
  response="$(curl -fsSL "${GITHUB_API}/releases/latest")" || return 0
  while IFS= read -r line; do
    if [[ "$line" =~ \"tag_name\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
      printf '%s' "${BASH_REMATCH[1]}"
      return
    fi
  done <<<"$response"
}

resolve_version() {
  if [[ -n "$VERSION" ]]; then
    printf '%s' "$VERSION"
    return
  fi
  local latest
  latest="$(latest_version)"
  [[ -n "$latest" ]] || die "无法获取最新发布版本"
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

is_ipv4() {
  local value="$1" octet
  [[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS=. read -r -a octets <<<"$value"
  for octet in "${octets[@]}"; do
    (( octet >= 0 && octet <= 255 )) || return 1
  done
}

detect_public_ip() {
  local endpoint value
  for endpoint in \
    https://api.ipify.org \
    https://ifconfig.me/ip \
    https://checkip.amazonaws.com
  do
    value="$(curl -fsS --max-time 5 "$endpoint" 2>/dev/null | tr -d '[:space:]' || true)"
    if is_ipv4 "$value"; then
      printf '%s' "$value"
      return
    fi
  done
}

default_access_url() {
  local public_ip
  public_ip="$(detect_public_ip)"
  if [[ -n "$public_ip" ]]; then
    printf 'http://%s:%s' "$public_ip" "$PORT"
    return
  fi
  printf 'http://localhost:%s' "$PORT"
}

validate_port() {
  local value="$1"
  [[ "$value" =~ ^[0-9]+$ ]] || die "端口必须是数字"
  (( value >= 1 && value <= 65535 )) || die "端口必须在 1 到 65535 之间"
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :${port}" | grep -q .
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  return 1
}

collect_port() {
  local default_port="${PORT:-$DEFAULT_PORT}"
  while true; do
    PORT="$(prompt_value 'HTTP 监听端口' "$default_port")"
    validate_port "$PORT"
    if ! port_in_use "$PORT"; then
      return
    fi
    if ! is_interactive; then
      die "端口 ${PORT} 已被占用；请使用 --port PORT 指定其他端口"
    fi
    printf '端口 %s 已被占用，请选择其他端口。\n' "$PORT" >/dev/tty
    default_port=""
  done
}

yaml_quote() {
  local value="$1"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "配置值必须是单行字符串"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

collect_config() {
  collect_port

  ADMIN_USERNAME="$(prompt_value '管理员用户名' "$ADMIN_USERNAME")"
  [[ -n "$ADMIN_USERNAME" ]] || die "管理员用户名不能为空"

  if [[ -z "$ADMIN_PASSWORD" ]]; then
    local generated_password
    generated_password="$(random_secret)"
    ADMIN_PASSWORD="$(prompt_value '管理员密码' "$generated_password")"
  fi
  [[ -n "$ADMIN_PASSWORD" ]] || die "管理员密码不能为空"

  TURNSTILE_SITE_KEY="$(prompt_value 'Turnstile site key，可选' "$TURNSTILE_SITE_KEY")"
  TURNSTILE_SECRET_KEY="$(prompt_value 'Turnstile secret key，可选' "$TURNSTILE_SECRET_KEY")"
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

existing_service_config_file() {
  [[ -f "$SERVICE_FILE" ]] || return
  grep -m1 '^Environment=CONFIG_PATH=' "$SERVICE_FILE" | cut -d '=' -f3-
}

migrate_config() {
  local source_config
  source_config="$(existing_service_config_file)"

  if [[ -f "$CONFIG_FILE" ]]; then
    chown "$SERVICE_NAME":"$SERVICE_NAME" "$CONFIG_FILE"
    chmod 0640 "$CONFIG_FILE"
    return
  fi

  if [[ -z "$source_config" || ! -f "$source_config" ]]; then
    source_config="$LEGACY_CONFIG_FILE"
  fi
  [[ -f "$source_config" ]] || return

  install -m 0640 -o "$SERVICE_NAME" -g "$SERVICE_NAME" "$source_config" "$CONFIG_FILE"
  log "已迁移配置: ${source_config} -> ${CONFIG_FILE}"
}

download_release() {
  local version="$1"
  local arch="$2"
  local tmpdir="$3"
  local asset="cf-email_linux_${arch}.tar.gz"
  local asset_url="${GITHUB_RELEASES}/${version}/${asset}"
  local checksum_url="${GITHUB_RELEASES}/${version}/checksums.txt"

  log "正在从 ${version} 下载 ${asset}"
  curl -fL --retry 3 --connect-timeout 10 -o "${tmpdir}/${asset}" "$asset_url"
  curl -fL --retry 3 --connect-timeout 10 -o "${tmpdir}/checksums.txt" "$checksum_url"

  (cd "$tmpdir" && grep "  ${asset}$" checksums.txt | sha256sum -c -) || die "${asset} 校验和验证失败"
  tar -xzf "${tmpdir}/${asset}" -C "$tmpdir"
  [[ -x "${tmpdir}/cf-email" ]] || die "发布归档中缺少可执行文件 cf-email"
}

install_binary() {
  local source_binary="$1"
  local backup=""
  if [[ -x "${INSTALL_DIR}/cf-email" ]]; then
    backup="${INSTALL_DIR}/cf-email.backup.$(date +%Y%m%d%H%M%S)"
    cp "${INSTALL_DIR}/cf-email" "$backup"
    log "已创建备份: ${backup}"
  fi
  install -m 0755 "$source_binary" "${INSTALL_DIR}/cf-email"
}

write_config() {
  if [[ -f "$CONFIG_FILE" ]]; then
    log "保留现有配置: ${CONFIG_FILE}"
    return
  fi

  local ingest_token ingest_secret session_secret admin_api_key
  ingest_token="$(random_secret)"
  ingest_secret="$(random_secret)"
  session_secret="$(random_secret)"
  admin_api_key="$(random_secret)"

  umask 077
  cat >"$CONFIG_FILE" <<EOF
bind_addr: ":${PORT}"
db_path: $(yaml_quote "${DATA_DIR}/email.db")
storage_dir: $(yaml_quote "$STORAGE_DIR")

ingest_token: $(yaml_quote "$ingest_token")
ingest_secret: $(yaml_quote "$ingest_secret")
session_secret: $(yaml_quote "$session_secret")
admin_api_key: $(yaml_quote "$admin_api_key")

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
ReadWritePaths=${DATA_DIR} ${STORAGE_DIR}

[Install]
WantedBy=multi-user.target
EOF
  chmod 0644 "$SERVICE_FILE"
  systemctl daemon-reload
}

command_file_available() {
  [[ ! -e "$COMMAND_FILE" && ! -L "$COMMAND_FILE" ]] && return 0
  grep -q 'cf-email management command' "$COMMAND_FILE" 2>/dev/null && return 0
  [[ -L "$COMMAND_FILE" && "$(readlink -f "$COMMAND_FILE")" == "${INSTALL_DIR}/cf-email" ]]
}

write_command() {
  command_file_available || die "${COMMAND_FILE} 已存在且不是 cf-email 管理命令"
  [[ -L "$COMMAND_FILE" ]] && rm -f "$COMMAND_FILE"
  cat >"$COMMAND_FILE" <<EOF
#!/usr/bin/env bash
# cf-email management command
set -Eeuo pipefail

APP_NAME="${APP_NAME}"
SERVICE_NAME="${SERVICE_NAME}"
INSTALL_DIR="${INSTALL_DIR}"
INSTALLER_URL="${INSTALLER_URL}"

die() { printf '[%s] 错误: %s\n' "\$APP_NAME" "\$*" >&2; exit 1; }

usage() {
  cat <<'HELP'
用法:
  cf-email start
  cf-email stop|pause
  cf-email restart
  cf-email status
  cf-email logs [journalctl 参数]
  cf-email update [--version VERSION]
  cf-email uninstall [-y] [--purge]
  cf-email help
HELP
}

ensure_root() {
  if [[ "\${EUID}" -eq 0 ]]; then
    return
  fi
  command -v sudo >/dev/null 2>&1 || die "请使用 root 运行，或先安装 sudo"
  exec sudo -E "\$0" "\$@"
}

run_installer() {
  local action="\$1"
  shift
  command -v curl >/dev/null 2>&1 || die "缺少必需命令: curl"
  curl -fsSL "\$INSTALLER_URL" | bash -s -- "\$action" --install-dir "\$INSTALL_DIR" "\$@"
}

command="\${1:-help}"
if [[ "\$#" -gt 0 ]]; then
  shift
fi

case "\$command" in
  start)
    ensure_root "\$command" "\$@"
    systemctl enable --now "\$SERVICE_NAME"
    ;;
  stop|pause)
    ensure_root "\$command" "\$@"
    systemctl stop "\$SERVICE_NAME"
    ;;
  restart)
    ensure_root "\$command" "\$@"
    systemctl restart "\$SERVICE_NAME"
    ;;
  status)
    systemctl status "\$SERVICE_NAME" --no-pager
    ;;
  logs)
    ensure_root "\$command" "\$@"
    if [[ "\$#" -gt 0 ]]; then
      journalctl -u "\$SERVICE_NAME" "\$@"
    else
      journalctl -u "\$SERVICE_NAME" -n 200 -f
    fi
    ;;
  update|upgrade)
    ensure_root "\$command" "\$@"
    run_installer upgrade "\$@"
    ;;
  uninstall|remove)
    ensure_root "\$command" "\$@"
    run_installer uninstall "\$@"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    die "未知命令: \${command}"
    ;;
esac
EOF
  chmod 0755 "$COMMAND_FILE"
}

remove_command() {
  if [[ -f "$COMMAND_FILE" ]] && grep -q 'cf-email management command' "$COMMAND_FILE" 2>/dev/null; then
    rm -f "$COMMAND_FILE"
    return
  fi
  if [[ -L "$COMMAND_FILE" && "$(readlink -f "$COMMAND_FILE")" == "${INSTALL_DIR}/cf-email" ]]; then
    rm -f "$COMMAND_FILE"
  fi
}

start_service() {
  systemctl enable --now "$SERVICE_NAME"
}

health_check_port() {
  if [[ -n "$PORT" ]]; then
    printf '%s' "$PORT"
    return
  fi
  if [[ -f "$CONFIG_FILE" ]]; then
    local bind_addr
    bind_addr="$(config_value bind_addr)"
    bind_addr="${bind_addr##*:}"
    if [[ -n "$bind_addr" ]]; then
      validate_port "$bind_addr"
      printf '%s' "$bind_addr"
      return
    fi
  fi
  printf '%s' "$DEFAULT_PORT"
}

verify_service() {
  local i check_port
  check_port="$(health_check_port)"
  for i in {1..20}; do
    if curl -fsS "http://127.0.0.1:${check_port}/healthz" >/dev/null 2>&1; then
      log "服务健康检查通过"
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
  local access_url admin_username admin_password ingest_token ingest_secret
  access_url="$(default_access_url)"
  admin_username="$(nested_config_value username)"
  admin_password="$(nested_config_value password)"
  ingest_token="$(config_value ingest_token)"
  ingest_secret="$(config_value ingest_secret)"

  cat <<EOF

cf-email 安装成功。

安装目录: ${INSTALL_DIR}
配置文件: ${CONFIG_FILE}
管理后台地址: ${access_url}/admin
管理员用户名: ${admin_username}
管理员密码: ${admin_password}

Worker 部署参数:
INGEST_URL=${access_url}/ingest/email
INGEST_TOKEN=${ingest_token}
INGEST_SECRET=${ingest_secret}

设置这些密钥后，请使用 wrangler 单独部署 Worker。

常用命令:
cf-email start
cf-email stop
cf-email restart
cf-email status
cf-email logs
cf-email update
EOF
}

do_install() {
  CURRENT_STEP=""
  check_system
  if [[ -x "${INSTALL_DIR}/cf-email" ]]; then
    die "cf-email 已安装；请使用 upgrade"
  fi
  collect_config
  set_step "正在创建系统用户"
  create_user
  set_step "正在准备安装目录"
  prepare_dirs

  local version arch tmpdir
  set_step "正在获取最新版本"
  version="$(resolve_version)"
  set_step "正在检测系统架构"
  arch="$(detect_arch)"
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"; trap - RETURN' RETURN

  CURRENT_STEP="正在下载发布包"
  download_release "$version" "$arch" "$tmpdir"
  set_step "正在安装程序文件"
  install_binary "${tmpdir}/cf-email"
  set_step "正在写入配置文件"
  write_config
  set_step "正在写入 systemd 服务"
  write_service
  set_step "正在写入管理命令"
  write_command
  set_step "正在启动服务"
  start_service
  set_step "正在检查服务健康状态"
  verify_service || die "服务健康检查未通过"
  CURRENT_STEP=""
  print_summary
}

do_upgrade() {
  CURRENT_STEP=""
  check_system
  [[ -x "${INSTALL_DIR}/cf-email" ]] || die "cf-email 尚未安装"
  set_step "正在创建系统用户"
  create_user
  set_step "正在准备安装目录"
  prepare_dirs
  set_step "正在迁移配置文件"
  migrate_config
  [[ -f "$CONFIG_FILE" ]] || die "找不到现有配置文件；请确认 ${CONFIG_FILE} 或 ${LEGACY_CONFIG_FILE} 存在"

  local version arch tmpdir previous
  set_step "正在获取最新版本"
  version="$(resolve_version)"
  set_step "正在检测系统架构"
  arch="$(detect_arch)"
  tmpdir="$(mktemp -d)"
  previous="${INSTALL_DIR}/cf-email.backup.$(date +%Y%m%d%H%M%S)"
  trap 'rm -rf "$tmpdir"; trap - RETURN' RETURN

  CURRENT_STEP="正在下载发布包"
  download_release "$version" "$arch" "$tmpdir"
  set_step "正在备份现有程序"
  cp "${INSTALL_DIR}/cf-email" "$previous"
  set_step "正在安装程序文件"
  install -m 0755 "${tmpdir}/cf-email" "${INSTALL_DIR}/cf-email"
  set_step "正在写入 systemd 服务"
  write_service
  set_step "正在写入管理命令"
  write_command
  set_step "正在重启服务"
  systemctl restart "$SERVICE_NAME"
  set_step "正在检查服务健康状态"
  if ! verify_service; then
    cp "$previous" "${INSTALL_DIR}/cf-email"
    systemctl restart "$SERVICE_NAME" || true
    die "升级失败，已回滚到 ${previous}"
  fi
  CURRENT_STEP=""
  log "已升级到 ${version}"
}

confirm_uninstall() {
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    return
  fi
  is_interactive || die "非交互模式卸载需要指定 -y"
  printf '确认卸载 cf-email？输入 yes 继续: ' >/dev/tty
  local answer
  IFS= read -r answer </dev/tty || true
  [[ "$answer" == "yes" ]] || die "已取消卸载"
}

do_uninstall() {
  check_system
  confirm_uninstall
  systemctl disable --now "$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "$SERVICE_FILE"
  remove_command
  systemctl daemon-reload
  rm -f "${INSTALL_DIR}/cf-email" "${INSTALL_DIR}"/cf-email.backup.*

  if [[ "$PURGE" -eq 1 ]]; then
    rm -rf "$INSTALL_DIR"
    userdel "$SERVICE_NAME" >/dev/null 2>&1 || true
    groupdel "$SERVICE_NAME" >/dev/null 2>&1 || true
    log "已卸载并清理 ${INSTALL_DIR}"
  else
    log "已卸载；配置和数据保留在 ${INSTALL_DIR}"
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
    *) die "未知命令: ${COMMAND}" ;;
  esac
}

main "$@"
