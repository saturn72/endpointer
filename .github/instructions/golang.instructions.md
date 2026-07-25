---
applyTo: "src/*-service/**"
---

# Go Service Conventions

## Project layout

Every Go service under `src/` follows idiomatic Go layout:

```
cmd/<service-name>/main.go   – entrypoint; wiring only, no business logic
internal/<package>/          – unexported packages; one concern per package
```

Do not flatten everything into the module root. Do not copy directory
conventions from another language (e.g. do not use `src/` or `lib/` inside
a Go module).

## S3 / AWS SDK

Call `github.com/aws/aws-sdk-go-v2` directly from wherever the call is
needed. Do not wrap the S3 client in a project-defined interface. This is
the same rule that the Next.js dashboard follows — no abstraction layer over
the SDK.

## Logging

Use `log/slog` (standard library, Go 1.21+) for all structured logging:

```go
slog.Info("message", "key", value)
slog.Error("failed to ...", "key", value, "error", err)
```

Do not use `fmt.Println`, `log.Printf`, or third-party logging libraries.

## Error handling

Wrap errors with context using `fmt.Errorf("doing X: %w", err)`. Never
swallow errors silently. At package boundaries, return errors to the caller
rather than logging and continuing. Log at the call site that decides to
skip or abort.

## Tests

Table-driven tests are the default style:

```go
tests := []struct{ name, input string; wantErr bool }{ ... }
for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) { ... })
}
```

`gofmt` and `go vet` must be clean before considering a change done.
Run them with:

```bash
gofmt -l .        # should produce no output
go vet ./...      # should produce no output
```

## Philosophy

Same cross-cutting rule as the rest of the repo: do not add infrastructure
(queues, caches, retries, dead-letter handling, checkpoint persistence) ahead
of a concrete stated requirement. Flag gaps as code comments (e.g.
`// Known gap: ...`) rather than solving them speculatively.
