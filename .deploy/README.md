# .deploy

Local/dev infrastructure only.

- `docker-compose.yml` — MongoDB + SeaweedFS containers needed by `src/dashboard`.
- `.env.example` — template of all env vars the dashboard reads.

Start services: `docker compose -f .deploy/docker-compose.yml up -d`

## Casdoor first-run setup

`casdoor/init_data.json` is gitignored (it holds the OIDC client secret). Create it once from the template before the first start:

```bash
cd .deploy/casdoor
cp init_data.example.json init_data.json
# replace clientId / clientSecret with random values, e.g. `openssl rand -hex 10` and `openssl rand -hex 20`
```

The Casdoor database password comes from `CASDOOR_DB_PASSWORD` (default `casdoor`, local only; set it in `.deploy/.env` before first start, as Postgres only reads it when the volume is created).

Use the same values as `AUTH_CASDOOR_ID` / `AUTH_CASDOOR_SECRET` in `src/dashboard/.env.local`. Casdoor only reads this file when the database is empty, so changes later must be made in the admin console (`http://localhost:8000`, default `built-in/admin` / `123`; change it before any non-local use, see issue #19). `scripts/check-casdoor-admin.sh [base_url]` exits 1 while the default admin password is still accepted; run it in any non-local deployment.

If host port 8083 is taken, set `DATAFEED_MANAGER_HOST_PORT` and point `DATAFEED_MANAGER_URL` at it.

## Pipeline isolation check

With the compose stack up, `scripts/e2e-isolation.sh` creates the same datafeed/endpoint name for two owners, uploads a different CSV for each through presigned URLs, and checks that each public URL serves only that owner's data. Set `MANAGER_SERVICE_TOKEN` and, if you changed host ports, `MANAGER_URL` / `DATAFEED_URL`.
