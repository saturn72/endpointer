// Command conversion-service watches raw-uploads for new CSV files and converts
// each one to JSON, writing the result to converted-feeds.
//
// Event source: SeaweedFS filer notification webhook (push model). The filer
// POSTs a JSON payload to POST /webhook on this service's HTTP server for each
// filer event. See .deploy/notification.toml for the filer-side configuration.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"github.com/endpointer-platform/conversion-service/internal/blobclient"
	"github.com/endpointer-platform/conversion-service/internal/converter"
	"github.com/endpointer-platform/conversion-service/internal/webhook"
)

func main() {
	cfg := mustLoadConfig()

	s3Client := blobclient.New(blobclient.Config{
		Endpoint:        cfg.s3Endpoint,
		Region:          cfg.s3Region,
		AccessKeyID:     cfg.s3AccessKeyID,
		SecretAccessKey: cfg.s3SecretAccessKey,
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Ensure both buckets exist before accepting any events.
	if err := ensureBucket(ctx, s3Client, cfg.rawBucket); err != nil {
		slog.Error("failed to ensure raw bucket", "bucket", cfg.rawBucket, "error", err)
		os.Exit(1)
	}
	if err := ensureBucket(ctx, s3Client, cfg.convertedBucket); err != nil {
		slog.Error("failed to ensure converted bucket", "bucket", cfg.convertedBucket, "error", err)
		os.Exit(1)
	}

	// Build the HTTP server that receives SeaweedFS filer webhook pushes.
	// The webhook routes events by bucket path prefix:
	//   raw-uploads   → CSV→JSON conversion (handled here)
	//   converted-feeds → forwarded to versioning-service when VERSIONING_WEBHOOK_URL is set
	rawPrefix := "/buckets/" + cfg.rawBucket + "/"
	convertedPrefix := "/buckets/" + cfg.convertedBucket + "/"
	mux := http.NewServeMux()
	mux.Handle("/webhook", webhook.Handler(func(p webhook.Payload) {
		switch {
		case strings.HasPrefix(p.Key, rawPrefix):
			key := strings.TrimPrefix(p.Key, rawPrefix)
			slog.Info("webhook received raw file", "key", key)
			if err := processEvent(ctx, s3Client, cfg.rawBucket, cfg.convertedBucket, key); err != nil {
				slog.Error("conversion failed", "key", key, "error", err)
			}
		case strings.HasPrefix(p.Key, convertedPrefix) && cfg.versioningWebhookURL != "":
			forwardWebhook(p, cfg.versioningWebhookURL)
		}
	}))

	srv := &http.Server{
		Addr:    cfg.webhookAddr,
		Handler: mux,
	}

	// Graceful shutdown on SIGTERM / SIGINT. The HTTP server's Shutdown method
	// waits for in-flight requests (i.e. in-progress conversions) to complete.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigCh
		slog.Info("received signal, shutting down", "signal", sig)
		if err := srv.Shutdown(context.Background()); err != nil {
			slog.Error("http server shutdown error", "error", err)
		}
	}()

	slog.Info("conversion-service listening",
		"addr", cfg.webhookAddr,
		"raw_bucket", cfg.rawBucket,
		"converted_bucket", cfg.convertedBucket,
		"versioning_forward", cfg.versioningWebhookURL != "",
	)

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("http server error", "error", err)
		os.Exit(1)
	}

	slog.Info("conversion-service stopped cleanly")
}

// processEvent fetches the raw CSV from S3, converts it to JSON, and writes
// the result to the converted-feeds bucket. The warnings metadata key, if
// present on the source object, is copied forward as required by the warning
// propagation contract (see .docs/decisions/001-versions-schema-and-warning-propagation.md).
func processEvent(ctx context.Context, s3c *s3.Client, rawBucket, convertedBucket, key string) error {
	// Parse endpoint_name and upload_uuid from the S3 key.
	// Format established in step_0_1: {endpoint_name}/{upload_uuid}/{filename}
	parts := strings.SplitN(key, "/", 3)
	if len(parts) < 3 {
		return fmt.Errorf("unexpected key format (want endpoint/uuid/file, got %q)", key)
	}
	endpointName := parts[0]
	uploadUUID := parts[1]

	// Fetch the raw CSV including its user metadata.
	getResp, err := s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(rawBucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("GetObject %s/%s: %w", rawBucket, key, err)
	}
	defer getResp.Body.Close()

	// Convert CSV → JSON.
	jsonBytes, err := converter.Convert(getResp.Body)
	if err != nil {
		// Log and skip — do not crash the service on bad input.
		return fmt.Errorf("converting %s: %w", key, err)
	}

	// Build the destination key: {endpoint_name}/{upload_uuid}/data.json
	destKey := endpointName + "/" + uploadUUID + "/data.json"

	// Propagate metadata to the converted object.
	// Always include "filename" (the original upload filename from the raw key)
	// so the versioning-service can store it for display in the dashboard.
	// Also propagate "warnings" if present on the source object.
	// Both keys are lower-case per S3 metadata normalisation.
	metadata := map[string]string{"filename": parts[2]}
	if w, ok := getResp.Metadata["warnings"]; ok && w != "" {
		metadata["warnings"] = w
	}
	putInput := &s3.PutObjectInput{
		Bucket:      aws.String(convertedBucket),
		Key:         aws.String(destKey),
		Body:        bytes.NewReader(jsonBytes),
		ContentType: aws.String("application/json"),
		Metadata:    metadata,
	}

	if _, err := s3c.PutObject(ctx, putInput); err != nil {
		return fmt.Errorf("PutObject %s/%s: %w", convertedBucket, destKey, err)
	}

	slog.Info("converted", "src", rawBucket+"/"+key, "dst", convertedBucket+"/"+destKey)
	return nil
}

// ensureBucket creates the bucket if it does not already exist.
// "Already exists" errors (BucketAlreadyOwnedByYou, BucketAlreadyExists) are
// tolerated; all other errors are fatal.
func ensureBucket(ctx context.Context, s3c *s3.Client, bucket string) error {
	_, err := s3c.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(bucket),
	})
	if err != nil {
		var alreadyOwned *types.BucketAlreadyOwnedByYou
		var alreadyExists *types.BucketAlreadyExists
		if errors.As(err, &alreadyOwned) || errors.As(err, &alreadyExists) {
			return nil
		}
		return fmt.Errorf("CreateBucket %s: %w", bucket, err)
	}
	slog.Info("created bucket", "bucket", bucket)
	return nil
}

type config struct {
	webhookAddr          string
	versioningWebhookURL string
	s3Endpoint           string
	s3Region             string
	s3AccessKeyID        string
	s3SecretAccessKey    string
	rawBucket            string
	convertedBucket      string
}

func mustLoadConfig() config {
	return config{
		webhookAddr:          getEnvOrDefault("WEBHOOK_ADDR", ":8080"),
		versioningWebhookURL: os.Getenv("VERSIONING_WEBHOOK_URL"),
		s3Endpoint:           mustEnv("S3_ENDPOINT"),
		s3Region:             getEnvOrDefault("S3_REGION", "us-east-1"),
		s3AccessKeyID:        mustEnv("S3_ACCESS_KEY_ID"),
		s3SecretAccessKey:    mustEnv("S3_SECRET_ACCESS_KEY"),
		rawBucket:            getEnvOrDefault("S3_RAW_BUCKET", "raw-uploads"),
		convertedBucket:      getEnvOrDefault("S3_CONVERTED_BUCKET", "converted-feeds"),
	}
}

// forwardWebhook re-posts the decoded payload as JSON to url. Fire-and-forget:
// on error the event is logged and dropped — versioning-service is expected to
// be up when the pipeline is running. Retry / dead-letter is backlog.
func forwardWebhook(p webhook.Payload, url string) {
	body, err := json.Marshal(p)
	if err != nil {
		slog.Error("marshalling payload for forward", "error", err)
		return
	}
	resp, err := http.Post(url, "application/json", bytes.NewReader(body)) //nolint:noctx
	if err != nil {
		slog.Error("forwarding webhook to versioning-service", "url", url, "error", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		slog.Error("versioning-service returned non-2xx", "url", url, "status", resp.StatusCode)
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var not set", "key", key)
		os.Exit(1)
	}
	return v
}

func getEnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
