#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install ca-certificates curl

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${tmp_dir}"' EXIT
curl -fsSL https://starship.rs/install.sh -o "${tmp_dir}/install.sh"
sh "${tmp_dir}/install.sh" --yes

install_config "${CONFIG_DIR}/starship/apple.toml" "${HOME}/.config/starship/apple.toml"
install_config "${CONFIG_DIR}/starship/ghostty.toml" "${HOME}/.config/starship/ghostty.toml"
install_config "${CONFIG_DIR}/starship/vscode.toml" "${HOME}/.config/starship/vscode.toml"
install_config "${CONFIG_DIR}/starship/default.toml" "${HOME}/.config/starship/default.toml"
append_managed_block "${CONFIG_DIR}/starship/bashrc.sh" "${HOME}/.bashrc" starship

log 'Starship 与主题已安装到当前用户目录'
