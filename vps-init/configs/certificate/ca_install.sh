#!/usr/bin/bash
set -euo pipefail

/root/.acme.sh/acme.sh --install-cert \
  -d <your domain> \
  --ecc \
  --cert-file '/etc/nginx/ssl/<your main domain>/cert.crt' \
  --key-file '/etc/nginx/ssl/<your main domain>/cert.key' \
  --fullchain-file '/etc/nginx/ssl/<your main domain>/fullchain.crt'
