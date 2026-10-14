#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install nginx
systemctl enable --now nginx

read -r -p '请输入域名（用于配置文件名）: ' domain
if [[ ! "${domain}" =~ ^[A-Za-z0-9.-]+$ ]] || [[ "${domain}" == .* ]] || [[ "${domain}" == *. ]]; then
  printf '域名格式无效: %s\n' "${domain}" >&2
  exit 1
fi

install_config "${CONFIG_DIR}/nginx/domain.conf" "/etc/nginx/conf.d/${domain}.conf"
install_config "${CONFIG_DIR}/nginx/00-default-deny.conf" "/etc/nginx/conf.d/00-default-deny.conf"

log "nginx 配置已写入 /etc/nginx/conf.d/${domain}.conf"
log '配置正文保留 vps.md 中的固定域名；未重新加载 nginx'
