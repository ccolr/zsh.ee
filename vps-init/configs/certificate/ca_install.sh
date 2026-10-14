#!/usr/bin/bash
set -euo pipefail

/root/.acme.sh/acme.sh --install-cert \
  -d eva.cm \
  -d www.eva.cm \
  --ecc \
  --cert-file '/etc/nginx/ssl/<your domain>/cert.crt' \
  --key-file '/etc/nginx/ssl/<your domain>/cert.key' \
  --fullchain-file '/etc/nginx/ssl/<your domain>/fullchain.crt'
