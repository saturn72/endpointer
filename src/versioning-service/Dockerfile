# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Download dependencies before copying source so Docker can cache this layer.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build a statically-linked binary (CGO disabled for distroless base).
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /versioning-service \
    ./cmd/versioning-service

# ── Final stage ───────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /versioning-service /versioning-service

ENTRYPOINT ["/versioning-service"]
