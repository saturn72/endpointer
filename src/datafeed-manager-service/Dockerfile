FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /datafeed-manager-service ./cmd/datafeed-manager-service

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /datafeed-manager-service /datafeed-manager-service
ENTRYPOINT ["/datafeed-manager-service"]