#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install ca-certificates cron curl
systemctl enable --now cron

curl -fsSL https://get.acme.sh | sh -s email=o@cco.moe
/root/.acme.sh/acme.sh --upgrade --auto-upgrade

install_config "${CONFIG_DIR}/certificate/ca_apply.sh" /root/ca_apply.sh 0700
install_config "${CONFIG_DIR}/certificate/ca_install.sh" /root/ca_install.sh 0700

log 'acme.sh 已配置，ca_apply.sh 与 ca_install.sh 已安装到 /root'
