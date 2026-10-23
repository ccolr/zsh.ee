#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install bat ca-certificates curl fd-find git tree wget

ln -sfn "$(command -v fdfind)" /usr/local/bin/fd
ln -sfn "$(command -v batcat)" /usr/local/bin/bat

bat_config_dir="$(bat --config-dir)"
install -d -m 0755 "${bat_config_dir}/themes"

for theme in Latte Frappe Macchiato Mocha; do
  wget -q -O "${bat_config_dir}/themes/Catppuccin ${theme}.tmTheme" \
    "https://github.com/catppuccin/bat/raw/main/themes/Catppuccin%20${theme}.tmTheme"
done

bat cache --build
append_managed_block /dev/stdin "${HOME}/.bashrc" bat-theme <<'EOF'
# bat
if [[ "${TERM_PROGRAM:-}" == "ghostty" ]]; then
  export BAT_THEME="Catppuccin Mocha"
else
  export BAT_THEME="GitHub"
fi
EOF

if [[ -d "${HOME}/.fzf/.git" ]]; then
  git -C "${HOME}/.fzf" pull --ff-only
else
  git clone --depth 1 https://github.com/junegunn/fzf.git "${HOME}/.fzf"
fi
"${HOME}/.fzf/install" --bin

append_managed_block "${CONFIG_DIR}/fzf/bashrc.sh" "${HOME}/.bashrc" fzf
append_managed_block "${CONFIG_DIR}/fzf/profile.sh" "${HOME}/.profile" fzf

log 'fzf、fd、bat、tree、Catppuccin bat 主题与当前用户配置已安装'
