#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
apt_install sudo

install_config "${CONFIG_DIR}/env/term-program.sudoers" /etc/sudoers.d/term-program 0440
visudo -cf /etc/sudoers.d/term-program
append_managed_block "${CONFIG_DIR}/env/bashrc.sh" "${HOME}/.bashrc" term-program

log 'TERM_PROGRAM 的 sudo 与 su 传递配置已完成'
