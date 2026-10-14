#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install ca-certificates curl

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${tmp_dir}"' EXIT
curl -fsSL https://sing-box.app/install.sh -o "${tmp_dir}/install.sh"
sh "${tmp_dir}/install.sh"

install_config "${CONFIG_DIR}/sing-box/config.json" /etc/sing-box/config.json
install -d -o sing-box -g sing-box -m 0750 /var/log/sing-box
touch /var/log/sing-box/sing-box.log
chown sing-box:sing-box /var/log/sing-box/sing-box.log
chmod 0640 /var/log/sing-box/sing-box.log

log 'sing-box 已安装，服务端配置与日志权限已写入；未重新加载服务'
