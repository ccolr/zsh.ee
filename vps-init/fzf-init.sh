#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install bat ca-certificates curl fd-find git tree

ln -sfn "$(command -v fdfind)" /usr/local/bin/fd
ln -sfn "$(command -v batcat)" /usr/local/bin/bat

if [[ -d "${HOME}/.fzf/.git" ]]; then
  git -C "${HOME}/.fzf" pull --ff-only
else
  git clone --depth 1 https://github.com/junegunn/fzf.git "${HOME}/.fzf"
fi
"${HOME}/.fzf/install" --bin

append_managed_block "${CONFIG_DIR}/fzf/bashrc.sh" "${HOME}/.bashrc" fzf
append_managed_block "${CONFIG_DIR}/fzf/profile.sh" "${HOME}/.profile" fzf

log 'fzf、fd、bat、tree 与当前用户配置已安装'
