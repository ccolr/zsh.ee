#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install ca-certificates curl

bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

install_config "${CONFIG_DIR}/xray/config.json" /usr/local/etc/xray/config.json

log 'Xray 已安装，服务端配置已写入；未重新加载服务'
