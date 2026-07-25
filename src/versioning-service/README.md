# versioning-service

Watches the `converted-feeds` S3 bucket for new JSON files produced by the
conversion-service, assigns each file the next `major.minor` version for its
endpoint, stores the version document in MongoDB, and removes the processed
object from `converted-feeds`.

## How it works

1. The conversion-service forwards SeaweedFS filer webhook events for
   `converted-feeds` to this service's `POST /webhook` endpoint.
2. On each event the service fetches the JSON object from SeaweedFS via the
   S3 API, determines the next version (minor auto-increment within the
   current max major; first-ever version for an endpoint is `1.0`), and
   inserts a version document into MongoDB's `versions` collection.
3. Any `warnings` metadata on the source object is carried into the version
   document's `warnings` field.
4. After a successful insert, the object is deleted from `converted-feeds`.

## MongoDB index

On startup this service ensures a unique compound index on
`(endpoint_name, major, minor)` in the `versions` collection:

```js
db.versions.createIndex(
  { endpoint_name: 1, major: 1, minor: 1 },
  { unique: true, name: "endpoint_version_unique" }
)
```

This service owns the `versions` collection and is responsible for that index.
No separate migration step is needed.

## Environment variables

| Variable              | Default          | Description                                              |
|-----------------------|------------------|----------------------------------------------------------|
| `WEBHOOK_ADDR`        | `:8081`          | `host:port` for the webhook HTTP listener                |
| `S3_ENDPOINT`         | —                | SeaweedFS S3 gateway URL (e.g. `http://localhost:8333`)  |
| `S3_REGION`           | `us-east-1`      | AWS region string (arbitrary for SeaweedFS)              |
| `S3_ACCESS_KEY_ID`    | —                | S3 access key                                            |
| `S3_SECRET_ACCESS_KEY`| —                | S3 secret key                                            |
| `S3_CONVERTED_BUCKET` | `converted-feeds`| Bucket this service reads from and cleans up             |
| `MONGODB_URI`         | —                | MongoDB connection string                                |
| `MONGODB_DB`          | —                | MongoDB database name                                    |

Copy `.deploy/.env.example` → `.env` and fill in the credential fields.

## Local development

```bash
# 1. Start infrastructure (SeaweedFS + MongoDB)
docker compose -f .deploy/docker-compose.yml up -d seaweedfs mongo

# 2. Copy and fill in env vars
cp .deploy/.env.example .env   # then edit .env

# 3. Run the service (from repo root)
cd src/versioning-service
go run ./cmd/versioning-service
```

The service starts an HTTP server on `WEBHOOK_ADDR` (default `:8081`).
In docker-compose, the conversion-service forwards converted-feeds events to
`http://versioning-service:8081/webhook` (configured via
`VERSIONING_WEBHOOK_URL`).

## Tests

```bash
cd src/versioning-service
go test ./...
go vet ./...
```
