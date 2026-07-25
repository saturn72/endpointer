# Endpointer Platform

A minimal Next.js application for creating endpoints (feed definitions) and uploading CSV data versions.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | MongoDB database name |
| `S3_ENDPOINT` | SeaweedFS S3 gateway URL |
| `S3_REGION` | S3 region (e.g. `us-east-1`) |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_RAW_BUCKET` | Bucket name for raw CSV uploads |

## Local Infrastructure

Start MongoDB and SeaweedFS:

```bash
docker compose up -d
```

## Database Initialisation

Run once after first setup to create the required unique index on `endpoints.name`:

```bash
npm run db:init
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Integration Tests

Tests require the Docker services to be running (see Local Infrastructure above).

```bash
npx playwright install chromium
npm test
```
