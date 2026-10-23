#!/usr/bin/bash
set -euo pipefail

: "${CF_Token:?请先 export CF_Token}"
: "${CF_Zone_ID:?请先 export CF_Zone_ID}"

/root/.acme.sh/acme.sh --issue \
    --server letsencrypt \
    --dns dns_cf \
    -d <your domain> \
    --keylength ec-256 \
    --force
