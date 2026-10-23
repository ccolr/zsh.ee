#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install fail2ban

ssh_target_file=/etc/ssh/sshd_config.d/00_custom.conf
fail2ban_target_file=/etc/fail2ban/jail.local

port_is_valid() {
  local port="$1"
  [[ "${port}" =~ ^[0-9]+$ ]] &&
    ((port >= 49152 && port <= 65535)) &&
    [[ ! "${port}" =~ [147] ]]
}

generate_port() {
  local random_value
  local candidate

  while true; do
    random_value="$(od -An -N2 -tu2 /dev/urandom)"
    candidate=$((49152 + random_value % 16384))
    if port_is_valid "${candidate}"; then
      printf '%s\n' "${candidate}"
      return
    fi
  done
}

ssh_port=""
if [[ -f "${ssh_target_file}" ]]; then
  ssh_port="$(awk '$1 == "Port" && $2 ~ /^[0-9]+$/ { print $2; exit }' "${ssh_target_file}")"
fi

if ! port_is_valid "${ssh_port}"; then
  ssh_port="$(generate_port)"
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${tmp_dir}"' EXIT

sed "s/__SSH_PORT__/${ssh_port}/" \
  "${CONFIG_DIR}/ssh/00_custom.conf" > "${tmp_dir}/00_custom.conf"
sed "s/__SSH_PORT__/${ssh_port}/" \
  "${CONFIG_DIR}/ssh/jail.local" > "${tmp_dir}/jail.local"

install -d -m 0755 /etc/ssh/sshd_config.d
install_config "${tmp_dir}/00_custom.conf" "${ssh_target_file}" 0644
install -d -m 0755 /etc/fail2ban
install_config "${tmp_dir}/jail.local" "${fail2ban_target_file}" 0644

if command -v sshd >/dev/null 2>&1; then
  sshd -t
elif [[ -x /usr/sbin/sshd ]]; then
  /usr/sbin/sshd -t
else
  printf '找不到 sshd，无法校验 SSH 配置。\n' >&2
  exit 1
fi

fail2ban-client -t

log "SSH 配置已写入 ${ssh_target_file}"
log "SSH 端口: ${ssh_port}"
log "Fail2ban 配置已写入 ${fail2ban_target_file}"
log 'SSH 服务未重新加载'
