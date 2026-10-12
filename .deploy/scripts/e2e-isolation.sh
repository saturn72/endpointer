#!/usr/bin/env bash
# End-to-end isolation check: two owners use the same datafeed/endpoint name, upload different
# files, and each public URL must serve only that owner's data.
# Needs the compose stack (manager, seaweedfs, conversion, versioning, datafeed-service).
# Usage: MANAGER_URL=http://localhost:8093 DATAFEED_URL=http://localhost:8092 MANAGER_SERVICE_TOKEN=... ./e2e-isolation.sh
set -euo pipefail
M="${MANAGER_URL:-http://localhost:8083}"
D="${DATAFEED_URL:-http://localhost:8082}"
: "${MANAGER_SERVICE_TOKEN:?set MANAGER_SERVICE_TOKEN}"
run="$(date +%s)$RANDOM"
name="iso${run}"
ua="isoa${run}"; ub="isob${run}"

call() { # owner method path [body]
  curl -sf -X "$2" "$M$3" -H "Authorization: Bearer $MANAGER_SERVICE_TOKEN" -H 'Content-Type: application/json' \
    -H "X-Owner-ID: $1" -H "X-Owner-Username: $1" ${4:+-d "$4"}
}
jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

provision() { # owner marker
  local id up
  id=$(call "$1" POST /datafeeds "{\"name\":\"$name\",\"description\":\"\",\"adapter\":\"static-file\",\"adapter_config\":{\"id_field\":\"id\"}}" | jget "['_id']")
  call "$1" POST /endpoints "{\"name\":\"$name\",\"datafeed_id\":\"$id\"}" >/dev/null
  printf 'id,owner\n1,%s\n' "$2" > "/tmp/$1.csv"
  up=$(call "$1" POST "/datafeeds/$id/upload-url" "{\"filename\":\"$1.csv\",\"size\":$(stat -c %s "/tmp/$1.csv"),\"content_type\":\"text/csv\"}")
  curl -sf -X PUT "$(jget "['url']" <<<"$up")" -H 'Content-Type: text/csv' \
    -H "x-amz-meta-original-filename: $(jget "['headers']['x-amz-meta-original-filename']" <<<"$up")" \
    --data-binary "@/tmp/$1.csv" >/dev/null
}
provision "$ua" "only-$ua"
provision "$ub" "only-$ub"

fetch() { # owner expected other
  for _ in $(seq 1 30); do
    body=$(curl -s "$D/$1/$name" || true)
    if grep -q "$2" <<<"$body"; then
      if grep -q "$3" <<<"$body"; then echo "FAIL: $1 sees $3" >&2; exit 1; fi
      echo "OK: $1 serves only its own data"; return
    fi
    sleep 1
  done
  echo "FAIL: $1 did not serve its data in time (last: $body)" >&2; exit 1
}
fetch "$ua" "only-$ua" "only-$ub"
fetch "$ub" "only-$ub" "only-$ua"
rm -f "/tmp/$ua.csv" "/tmp/$ub.csv"
