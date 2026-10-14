#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
require_x86_64
apt_install ca-certificates curl tar

install_config "${CONFIG_DIR}/realm/99-realm.conf" /etc/sysctl.d/99-realm.conf
sysctl --system

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${tmp_dir}"' EXIT
curl -fsSL \
  https://github.com/zhboner/realm/releases/latest/download/realm-x86_64-unknown-linux-musl.tar.gz \
  -o "${tmp_dir}/realm.tar.gz"
tar -xzf "${tmp_dir}/realm.tar.gz" -C "${tmp_dir}"
install -m 0755 "${tmp_dir}/realm" /usr/local/bin/realm

install_config "${CONFIG_DIR}/realm/config.toml" /etc/realm/config.toml
install_config "${CONFIG_DIR}/realm/realm.service" /etc/systemd/system/realm.service
systemctl daemon-reload

log 'Realm 已安装并配置，服务未启用、未启动'
