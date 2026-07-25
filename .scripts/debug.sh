#!/usr/bin/env bash
# debug.sh — start all Go services under Delve so VS Code can attach.
#
# Usage:
#   bash .scripts/debug.sh
#
# Prerequisites:
#   - Docker running (for mongo + seaweedfs infrastructure)
#   - dlv installed: go install github.com/go-delve/delve/cmd/dlv@latest
#   - .deploy/.env exists (copy from .deploy/.env.example and fill in credentials)
#
# After the services are ready, attach VS Code using the "Go: Attach *" launch
# configurations in .vscode/launch.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Prerequisites ─────────────────────────────────────────────────────────────

if ! command -v dlv &>/dev/null; then
  echo "ERROR: dlv not found." >&2
  echo "       Install with: go install github.com/go-delve/delve/cmd/dlv@latest" >&2
  exit 1
fi

ENV_FILE="$ROOT/.deploy/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "       Copy .deploy/.env.example to .deploy/.env and fill in credentials." >&2
  exit 1
fi

# ── Infrastructure ────────────────────────────────────────────────────────────

echo "Starting infrastructure (mongo, seaweedfs)..."
docker compose -f "$ROOT/.deploy/docker-compose.yml" up -d mongo seaweedfs

# ── Environment ───────────────────────────────────────────────────────────────

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

# Override container-internal URLs to their localhost equivalents.
export S3_ENDPOINT="http://localhost:8333"
export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017}"
export MONGODB_DB="${MONGODB_DB:-endpointer}"
export VERSIONING_WEBHOOK_URL="http://localhost:8081/webhook"

# ── Cleanup on exit ───────────────────────────────────────────────────────────

PIDS=()
cleanup() {
  echo ""
  echo "Stopping debug services..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

# ── Services under dlv ────────────────────────────────────────────────────────
# Delve ports:  conversion-service :2345 | versioning-service :2346 | datafeed-service :2347
# Service ports: webhook :8080 / :8081 | datafeed HTTP :8082

echo "Starting conversion-service  (dlv :2345, webhook :8080)..."
(
  export WEBHOOK_ADDR=":8080"
  cd "$ROOT/src/conversion-service"
  dlv debug --headless --listen=":2345" --api-version=2 --log=false ./cmd/conversion-service
) &
PIDS+=($!)

echo "Starting versioning-service  (dlv :2346, webhook :8081)..."
(
  export WEBHOOK_ADDR=":8081"
  cd "$ROOT/src/versioning-service"
  dlv debug --headless --listen=":2346" --api-version=2 --log=false ./cmd/versioning-service
) &
PIDS+=($!)

echo "Starting datafeed-service    (dlv :2347, HTTP :8082)..."
(
  export PORT="8082"
  cd "$ROOT/src/datafeed-service"
  dlv debug --headless --listen=":2347" --api-version=2 --log=false ./cmd/datafeed-service
) &
PIDS+=($!)

echo "Starting dashboard           (Next.js :3000)..."
(
  cd "$ROOT/src/dashboard"
  npm run dev
) &
PIDS+=($!)

echo ""
echo "Services are compiling and starting. Once ready, attach VS Code using:"
echo "  'Go: Attach conversion-service'  → :2345"
echo "  'Go: Attach versioning-service'  → :2346"
echo "  'Go: Attach datafeed-service'    → :2347"
echo "  'Go: Attach all services'        (compound — attaches all three at once)"
echo "  'Next.js: attach to running'     → http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services."

wait

wait
