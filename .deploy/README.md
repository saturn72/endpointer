# .deploy

Local/dev infrastructure only.

- `docker-compose.yml` — MongoDB + SeaweedFS containers needed by `src/dashboard`.
- `.env.example` — template of all env vars the dashboard reads.

Start services: `docker compose -f .deploy/docker-compose.yml up -d`
