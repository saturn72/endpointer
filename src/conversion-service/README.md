# conversion-service

Watches the `raw-uploads` S3 bucket for new CSV files and converts each one
to JSON, writing the result to the `converted-feeds` bucket.

## How it works

1. The SeaweedFS filer is configured (via `notification.toml`) to push HTTP
   webhook events to this service for every file created under
   `/buckets/raw-uploads/`.
2. On each webhook call the service fetches the raw CSV from SeaweedFS via the
   S3 API, converts it to a JSON array of objects (first CSV row = keys), and
   writes the result as `{endpoint}/{uuid}/data.json` in `converted-feeds`.
3. Any `warnings` metadata present on the source object is forwarded verbatim
   to the destination object.

## Environment variables

| Variable              | Default          | Description                                      |
|-----------------------|------------------|--------------------------------------------------|
| `WEBHOOK_ADDR`        | `:8080`          | `host:port` for the webhook HTTP listener        |
| `S3_ENDPOINT`         | —                | SeaweedFS S3 gateway URL (e.g. `http://localhost:8333`) |
| `S3_REGION`           | `us-east-1`      | AWS region string (arbitrary for SeaweedFS)      |
| `S3_ACCESS_KEY_ID`    | —                | S3 access key                                    |
| `S3_SECRET_ACCESS_KEY`| —                | S3 secret key                                    |
| `S3_RAW_BUCKET`       | `raw-uploads`    | Source bucket                                    |
| `S3_CONVERTED_BUCKET` | `converted-feeds`| Destination bucket                               |

Copy `.deploy/.env.example` → `.env` and fill in the credential fields.

## Local development

```bash
# 1. Start infrastructure (SeaweedFS + MongoDB)
docker compose -f .deploy/docker-compose.yml up -d seaweedfs mongo

# 2. Configure SeaweedFS to push webhooks to localhost
#    Edit .deploy/notification.toml and change the endpoint:
#      endpoint = "http://host.docker.internal:8080/webhook"
#    (use host.docker.internal so the SeaweedFS container can reach your
#    locally running service)

# 3. Copy and fill in env vars
cp .deploy/.env.example .env   # then edit .env

# 4. Run the service
cd src/conversion-service
go run ./cmd/conversion-service
```

The service starts an HTTP server on `WEBHOOK_ADDR` (default `:8080`) and
logs each incoming webhook event.

## Tests

```bash
cd src/conversion-service
go test ./...
go vet ./...
```
