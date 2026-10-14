#!/bin/sh
set -eu

DEFAULT_BASE_URL="https://zsh.ee/vps-init"
BASE_URL="${VPS_INIT_BASE_URL:-${DEFAULT_BASE_URL}}"

script_dir=""
if [ -f "$0" ]; then
  script_dir=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd || true)
fi
if [ -n "${script_dir}" ] && [ -f "${script_dir}/runner-init.sh" ]; then
  exec bash "${script_dir}/runner-init.sh" "$@"
fi

if ! command -v curl >/dev/null 2>&1; then
  printf '缺少 curl，无法下载 VPS 初始化包。\n' >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  printf '缺少 tar，无法解压 VPS 初始化包。\n' >&2
  exit 1
fi

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/vps-init.XXXXXX")
cleanup() {
  if [ -n "${tmp_dir:-}" ] && [ -d "${tmp_dir}" ]; then
    rm -rf -- "${tmp_dir}"
  fi
}
trap cleanup EXIT HUP INT TERM

archive="${tmp_dir}/vps-init.tar.gz"
curl -fsSL "${BASE_URL%/}/vps-init.tar.gz" -o "${archive}"
tar -xzf "${archive}" -C "${tmp_dir}"

runner="${tmp_dir}/vps-init/runner-init.sh"
if [ ! -f "${runner}" ]; then
  printf '初始化包中缺少 runner-init.sh。\n' >&2
  exit 1
fi

status=0
if [ -r /dev/tty ] && (: </dev/tty) 2>/dev/null; then
  bash "${runner}" "$@" </dev/tty || status=$?
else
  bash "${runner}" "$@" || status=$?
fi
exit "${status}"
