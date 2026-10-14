#!/usr/bin/env bash

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${PROJECT_DIR}/configs"

log() {
  printf '==> %s\n' "$*"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    printf '此模块需要 root 权限。\n' >&2
    exit 1
  fi
}

require_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then
    printf '此脚本仅支持使用 apt 的 Debian/Ubuntu 系统。\n' >&2
    exit 1
  fi
}

require_x86_64() {
  if [[ "$(uname -m)" != "x86_64" ]]; then
    printf '此模块当前只配置了 x86_64 安装包。\n' >&2
    exit 1
  fi
}

apt_install() {
  require_apt
  if [[ "${VPS_INIT_APT_UPDATED:-0}" != "1" ]]; then
    apt-get update
  fi
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

install_config() {
  local source_file="$1"
  local target_file="$2"
  local mode="${3:-0644}"

  install -D -m "${mode}" "${source_file}" "${target_file}"
}

append_managed_block() {
  local source_file="$1"
  local target_file="$2"
  local block_name="$3"
  local start_marker="# >>> vps-init: ${block_name} >>>"
  local end_marker="# <<< vps-init: ${block_name} <<<"

  touch "${target_file}"
  if grep -Fqx "${start_marker}" "${target_file}"; then
    sed -i "\|^${start_marker}$|,\|^${end_marker}$|d" "${target_file}"
  fi

  {
    printf '\n%s\n' "${start_marker}"
    cat "${source_file}"
    printf '%s\n' "${end_marker}"
  } >> "${target_file}"
}
