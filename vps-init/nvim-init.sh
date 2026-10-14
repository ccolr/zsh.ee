#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
require_x86_64
apt_install ca-certificates curl git tar

tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "${tmp_dir}"' EXIT
curl -fsSL \
  https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.tar.gz \
  -o "${tmp_dir}/nvim.tar.gz"
tar -C /opt -xzf "${tmp_dir}/nvim.tar.gz"

install_config "${CONFIG_DIR}/nvim/init.lua" "${HOME}/.config/nvim/init.lua"
install_config "${CONFIG_DIR}/nvim/lua/config/lazy.lua" "${HOME}/.config/nvim/lua/config/lazy.lua"
install_config "${CONFIG_DIR}/nvim/lua/plugins/airline.lua" "${HOME}/.config/nvim/lua/plugins/airline.lua"
install_config "${CONFIG_DIR}/nvim/lua/plugins/catppuccin.lua" "${HOME}/.config/nvim/lua/plugins/catppuccin.lua"
install_config "${CONFIG_DIR}/nvim/lua/plugins/startify.lua" "${HOME}/.config/nvim/lua/plugins/startify.lua"
append_managed_block "${CONFIG_DIR}/nvim/bashrc.sh" "${HOME}/.bashrc" nvim

lazy_path="${XDG_DATA_HOME:-${HOME}/.local/share}/nvim/lazy/lazy.nvim"
if [[ -d "${lazy_path}/.git" ]]; then
  git -C "${lazy_path}" pull --ff-only
else
  git clone --filter=blob:none --branch=stable \
    https://github.com/folke/lazy.nvim.git "${lazy_path}"
fi

PATH="/opt/nvim-linux-x86_64/bin:${PATH}" nvim --headless '+Lazy! sync' +qa

log 'Neovim、lazy.nvim 与插件配置已安装到当前用户目录'
