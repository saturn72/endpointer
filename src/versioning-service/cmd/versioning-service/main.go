// Command versioning-service watches converted-feeds for new JSON files,
// assigns each a major.minor version for its endpoint, stores the version
// document in MongoDB, and removes the object from converted-feeds.
//
// Event source: HTTP webhook. The conversion-service forwards SeaweedFS filer
// push events for the converted-feeds bucket to this service's POST /webhook
// endpoint. See VERSIONING_WEBHOOK_URL in conversion-service's config and
// .deploy/notification.toml for the pipeline wiring.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/endpointer-platform/versioning-service/internal/blobclient"
	"github.com/endpointer-platform/versioning-service/internal/mongoclient"
	"github.com/endpointer-platform/versioning-service/internal/versioning"
	"github.com/endpointer-platform/versioning-service/internal/webhook"
)

func main() {
	cfg := mustLoadConfig()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to MongoDB and ensure the unique index on versions exists.
	mongoClient, db, err := mongoclient.New(ctx, mongoclient.Config{
		URI: cfg.mongoURI,
		DB:  cfg.mongoDB,
	})
	if err != nil {
		slog.Error("failed to connect to MongoDB", "error", err)
		os.Exit(1)
	}
	defer mongoClient.Disconnect(ctx) //nolint:errcheck

	col := db.Collection("versions")
	if err := ensureIndex(ctx, col); err != nil {
		slog.Error("failed to ensure versions index", "error", err)
		os.Exit(1)
	}

	// Build the S3 client for reading from / deleting in converted-feeds.
	s3Client := blobclient.New(blobclient.Config{
		Endpoint:        cfg.s3Endpoint,
		Region:          cfg.s3Region,
		AccessKeyID:     cfg.s3AccessKeyID,
		SecretAccessKey: cfg.s3SecretAccessKey,
	})

	// Build the HTTP server that receives forwarded webhook events.
	mux := http.NewServeMux()
	mux.Handle("/webhook", webhook.Handler(cfg.convertedBucket, func(key string) {
		if err := processEvent(ctx, s3Client, col, cfg.convertedBucket, key); err != nil {
			slog.Error("versioning failed", "key", key, "error", err)
		}
	}))

	srv := &http.Server{
		Addr:    cfg.webhookAddr,
		Handler: mux,
	}

	// Graceful shutdown on SIGTERM / SIGINT.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigCh
		slog.Info("received signal, shutting down", "signal", sig)
		if err := srv.Shutdown(context.Background()); err != nil {
			slog.Error("http server shutdown error", "error", err)
		}
	}()

	slog.Info("versioning-service listening",
		"addr", cfg.webhookAddr,
		"converted_bucket", cfg.convertedBucket,
		"mongo_db", cfg.mongoDB,
	)

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("http server error", "error", err)
		os.Exit(1)
	}

	slog.Info("versioning-service stopped cleanly")
}

// versionDoc is the MongoDB document stored in the versions collection.
type versionDoc struct {
	DatafeedID      string      `bson:"datafeed_id"`
	UploadID        string      `bson:"upload_id"` // uuid segment of the raw key; lets sweepers tell processed uploads apart
	Major           int         `bson:"major"`
	Minor           int         `bson:"minor"`
	Content         interface{} `bson:"content"`
	Warnings        []string    `bson:"warnings"`
	Filename        string      `bson:"filename"` // original upload filename (e.g. products.csv)
	SourceUploadKey string      `bson:"source_upload_key"`
	CreatedAt       time.Time   `bson:"created_at"`
	Published       bool        `bson:"published"` // false = not yet live on the public API
}

// processEvent fetches the JSON object from converted-feeds, assigns the next
// version, stores a version document in MongoDB, and deletes the S3 object.
func processEvent(ctx context.Context, s3c *s3.Client, col *mongo.Collection, convertedBucket, key string) error {
	// Parse datafeed_id and upload_id from the converted-feeds key.
	// Format: {datafeed_id}/{upload_uuid}/data.json
	parts := strings.SplitN(key, "/", 3)
	if len(parts) < 3 {
		return fmt.Errorf("unexpected key format (want datafeed/uuid/file, got %q)", key)
	}
	datafeedID := parts[0]
	uploadID := parts[1]

	// Fetch the converted JSON including its user metadata.
	getResp, err := s3c.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(convertedBucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("GetObject %s/%s: %w", convertedBucket, key, err)
	}
	defer getResp.Body.Close()

	bodyBytes, err := io.ReadAll(getResp.Body)
	if err != nil {
		return fmt.Errorf("reading body %s/%s: %w", convertedBucket, key, err)
	}

	// Parse the body as JSON. If it's malformed, log and skip — don't crash.
	var content interface{}
	if err := json.Unmarshal(bodyBytes, &content); err != nil {
		slog.Error("malformed JSON in converted object; skipping",
			"key", key, "error", err)
		return nil
	}

	// Read the warnings metadata key if present (JSON-encoded string array).
	warnings := []string{}
	if w, ok := getResp.Metadata["warnings"]; ok && w != "" {
		if err := json.Unmarshal([]byte(w), &warnings); err != nil {
			slog.Error("failed to parse warnings metadata; using empty array",
				"key", key, "error", err)
			warnings = []string{}
		}
	}

	// Read the original upload filename propagated by the conversion-service.
	filename := getResp.Metadata["filename"]

	// Compute the next version for this datafeed by querying the current max.
	major, minor, err := nextVersionForDatafeed(ctx, col, datafeedID)
	if err != nil {
		return fmt.Errorf("computing next version for %s: %w", datafeedID, err)
	}

	// Insert the version document.
	doc := versionDoc{
		DatafeedID:      datafeedID,
		UploadID:        uploadID,
		Major:           major,
		Minor:           minor,
		Content:         content,
		Warnings:        warnings,
		Filename:        filename,
		SourceUploadKey: key,
		CreatedAt:       time.Now().UTC(),
	}
	if _, err := col.InsertOne(ctx, doc); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			// Duplicate major.minor — likely a re-delivered event. Log and skip.
			// Known gap: no dedup/idempotency mechanism beyond this log-and-skip.
			slog.Error("duplicate version; skipping",
				"datafeed", datafeedID, "major", major, "minor", minor)
			return nil
		}
		return fmt.Errorf("inserting version %s %d.%d: %w", datafeedID, major, minor, err)
	}
	slog.Info("version stored",
		"datafeed", datafeedID, "major", major, "minor", minor, "key", key)

	// Delete the processed object from converted-feeds.
	// Known gap: if the delete fails after a successful insert, the object is
	// orphaned. A cleanup pass for orphaned converted-feeds objects is backlog.
	if _, err := s3c.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(convertedBucket),
		Key:    aws.String(key),
	}); err != nil {
		slog.Error("failed to delete processed object from converted-feeds",
			"key", key, "error", err)
	}

	return nil
}

// nextVersionForDatafeed queries MongoDB for the current max (major, minor)
// for the datafeed and delegates to versioning.NextVersion.
func nextVersionForDatafeed(ctx context.Context, col *mongo.Collection, datafeedID string) (major, minor int, err error) {
	var result struct {
		Major int `bson:"major"`
		Minor int `bson:"minor"`
	}
	opts := options.FindOne().SetSort(bson.D{{Key: "major", Value: -1}, {Key: "minor", Value: -1}})
	queryErr := col.FindOne(ctx, bson.M{"datafeed_id": datafeedID}, opts).Decode(&result)

	switch {
	case queryErr == nil:
		major, minor = versioning.NextVersion(result.Major, result.Minor, true)
	case errors.Is(queryErr, mongo.ErrNoDocuments):
		major, minor = versioning.NextVersion(0, 0, false)
	default:
		return 0, 0, fmt.Errorf("querying max version for %s: %w", datafeedID, queryErr)
	}
	return major, minor, nil
}

// ensureIndex creates the unique compound index on (datafeed_id, major, minor)
// and drops the legacy endpoint_name index, which would otherwise collide on
// documents that no longer carry endpoint_name.
func ensureIndex(ctx context.Context, col *mongo.Collection) error {
	// Absent index is fine.
	_ = col.Indexes().DropOne(ctx, "versions_unique_version")

	indexModel := mongo.IndexModel{
		Keys: bson.D{
			{Key: "datafeed_id", Value: 1},
			{Key: "major", Value: 1},
			{Key: "minor", Value: 1},
		},
		Options: options.Index().SetUnique(true).SetName("versions_datafeed_unique_version"),
	}
	_, err := col.Indexes().CreateOne(ctx, indexModel)
	if err != nil {
		return fmt.Errorf("creating unique version index: %w", err)
	}
	return nil
}

type config struct {
	webhookAddr       string
	s3Endpoint        string
	s3Region          string
	s3AccessKeyID     string
	s3SecretAccessKey string
	convertedBucket   string
	mongoURI          string
	mongoDB           string
}

func mustLoadConfig() config {
	return config{
		webhookAddr:       getEnvOrDefault("WEBHOOK_ADDR", ":8081"),
		s3Endpoint:        mustEnv("S3_ENDPOINT"),
		s3Region:          getEnvOrDefault("S3_REGION", "us-east-1"),
		s3AccessKeyID:     mustEnv("S3_ACCESS_KEY_ID"),
		s3SecretAccessKey: mustEnv("S3_SECRET_ACCESS_KEY"),
		convertedBucket:   getEnvOrDefault("S3_CONVERTED_BUCKET", "converted-feeds"),
		mongoURI:          mustEnv("MONGODB_URI"),
		mongoDB:           mustEnv("MONGODB_DB"),
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
