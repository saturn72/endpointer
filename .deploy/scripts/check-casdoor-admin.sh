#!/usr/bin/env bash
# Exits 1 when Casdoor still accepts the default built-in/admin password (123).
set -euo pipefail
base="${1:-http://localhost:8000}"
resp=$(curl -s -X POST "$base/api/login" -H 'Content-Type: application/json' \
  -d '{"application":"app-built-in","organization":"built-in","username":"admin","password":"123","type":"login"}')
if grep -q '"status":"ok"' <<<"$resp"; then
  echo "FAIL: default Casdoor admin password is still in use at $base" >&2
  exit 1
fi
echo "OK: default Casdoor admin password is not accepted at $base"
