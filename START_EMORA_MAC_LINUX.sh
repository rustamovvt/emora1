#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
echo "EMORA: http://localhost:8787"
exec node server.mjs
