#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${PROJECT_DIR}/public"

if [[ -e "${OUTPUT_DIR}" ]] && [[ ! -f "${OUTPUT_DIR}/.vps-init-build-output" ]]; then
  printf '拒绝覆盖不是由本脚本生成的目录: %s\n' "${OUTPUT_DIR}" >&2
  exit 1
fi

rm -rf -- "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}/vps-init"
touch "${OUTPUT_DIR}/.vps-init-build-output"

cp -R "${PROJECT_DIR}/vps-init/." "${OUTPUT_DIR}/vps-init/"
tar -C "${PROJECT_DIR}" -czf "${OUTPUT_DIR}/vps-init/vps-init.tar.gz" vps-init

if [[ -d "${PROJECT_DIR}/SurgeModules" ]]; then
  cp -R "${PROJECT_DIR}/SurgeModules" "${OUTPUT_DIR}/SurgeModules"
fi

printf 'Vercel 静态输出已生成: %s\n' "${OUTPUT_DIR}"
