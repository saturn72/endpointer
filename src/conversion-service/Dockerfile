# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Download dependencies before copying source so Docker can cache this layer.
COPY go.mod go.sum ./
RUN go mod download

# Copy proto-generated sources and all application code.
COPY . .

# Build a statically-linked binary (CGO disabled for scratch/distroless base).
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /conversion-service \
    ./cmd/conversion-service

# ── Final stage ───────────────────────────────────────────────────────────────
# gcr.io/distroless/static-debian12 is minimal (no shell) but includes CA
# certificates and timezone data — useful if the service ever calls TLS
# endpoints.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /conversion-service /conversion-service

ENTRYPOINT ["/conversion-service"]
