#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

MODULES=(
  locale-init.sh
  ufw-init.sh
  nginx-init.sh
  certificate-init.sh
  realm-init.sh
  xray-init.sh
  sing-box-init.sh
  nvim-init.sh
  starship-init.sh
  fzf-init.sh
  env-init.sh
  ssh-init.sh
)

show_menu() {
  cat <<'EOF'
VPS 初始化菜单

  1) locale
  2) ufw
  3) nginx
  4) certificate / acme.sh
  5) realm
  6) xray
  7) sing-box
  8) nvim / lazy.nvim
  9) starship
 10) fzf
 11) TERM_PROGRAM 环境传递
 12) SSH
 13) 执行全部
EOF
}

run_module() {
  local module="$1"
  printf '\n==> %s\n' "${module%.sh}"
  bash "${SCRIPT_DIR}/${module}"
}

run_all() {
  if [[ "${EUID}" -ne 0 ]]; then
    printf '执行全部模块需要 root 权限。\n' >&2
    exit 1
  fi

  apt-get update
  export VPS_INIT_APT_UPDATED=1

  local module
  for module in "${MODULES[@]}"; do
    run_module "${module}"
  done
}

show_menu
choice="${1:-}"
if [[ -z "${choice}" ]]; then
  read -r -p '请输入编号: ' choice
fi

case "${choice}" in
  1|2|3|4|5|6|7|8|9|10|11|12)
    run_module "${MODULES[$((choice - 1))]}"
    ;;
  13)
    run_all
    ;;
  *)
    printf '无效编号: %s\n' "${choice}" >&2
    exit 1
    ;;
esac
