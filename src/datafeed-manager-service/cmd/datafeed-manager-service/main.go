package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/endpointer-platform/datafeed-manager-service/internal/manager"
	"github.com/endpointer-platform/datafeed-manager-service/internal/mongoclient"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func main() {
	cfg := loadConfig()
	if cfg.serviceToken == "" {
		slog.Error("MANAGER_SERVICE_TOKEN is required")
		os.Exit(1)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	mongoClient, db, err := mongoclient.New(ctx, mongoclient.Config{URI: cfg.mongoURI, DB: cfg.mongoDB})
	if err != nil {
		slog.Error("failed to connect to MongoDB", "error", err)
		os.Exit(1)
	}
	defer mongoClient.Disconnect(context.Background()) //nolint:errcheck
	if err := ensureIndexes(ctx, db); err != nil {
		slog.Error("failed to create manager indexes", "error", err)
		os.Exit(1)
	}

	s3Options := s3.Options{Region: cfg.s3Region, Credentials: credentials.NewStaticCredentialsProvider(cfg.s3AccessKey, cfg.s3SecretKey, ""), UsePathStyle: true}
	if cfg.s3Endpoint != "" {
		s3Options.BaseEndpoint = &cfg.s3Endpoint
	}
	// Presigned URLs are used by browsers, so they must be signed for the public S3 host.
	presignOptions := s3Options
	if cfg.s3PublicEndpoint != "" {
		presignOptions.BaseEndpoint = &cfg.s3PublicEndpoint
	}
	h := &manager.Handler{Datafeeds: db.Collection("datafeeds"), Endpoints: db.Collection("endpoints"), DB: db, Presigner: s3.NewPresignClient(s3.New(presignOptions)), Bucket: cfg.rawBucket, ServiceToken: cfg.serviceToken}
	srv := &http.Server{Addr: ":" + cfg.port, Handler: manager.Router(h)}
	go func() { <-ctx.Done(); _ = srv.Shutdown(context.Background()) }()
	slog.Info("datafeed-manager-service listening", "addr", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("http server error", "error", err)
		os.Exit(1)
	}
}

type config struct{ port, mongoURI, mongoDB, s3Endpoint, s3PublicEndpoint, s3Region, s3AccessKey, s3SecretKey, rawBucket, serviceToken string }

func loadConfig() config {
	return config{port: env("PORT", "8080"), mongoURI: env("MONGODB_URI", "mongodb://localhost:27017"), mongoDB: env("MONGODB_DB", "endpointer"), s3Endpoint: env("S3_ENDPOINT", ""), s3PublicEndpoint: env("S3_PUBLIC_ENDPOINT", env("S3_ENDPOINT", "")), s3Region: env("S3_REGION", "us-east-1"), s3AccessKey: os.Getenv("S3_ACCESS_KEY_ID"), s3SecretKey: os.Getenv("S3_SECRET_ACCESS_KEY"), rawBucket: env("S3_RAW_BUCKET", "raw-uploads"), serviceToken: os.Getenv("MANAGER_SERVICE_TOKEN")}
}
func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func ensureIndexes(ctx context.Context, db *mongo.Database) error {
	_, err := db.Collection("datafeeds").Indexes().CreateMany(ctx, []mongo.IndexModel{{
		Keys:    bson.D{{Key: "owner_id", Value: 1}, {Key: "name", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("datafeeds_owner_name_unique"),
	}})
	if err != nil {
		return fmt.Errorf("creating datafeed indexes: %w", err)
	}
	// Pre-tenancy deployments have a global unique name index that blocks two owners sharing a name.
	if err := db.Collection("endpoints").Indexes().DropOne(ctx, "endpoints_name_unique"); err != nil && !isIndexNotFound(err) {
		return fmt.Errorf("dropping legacy endpoint name index: %w", err)
	}
	_, err = db.Collection("endpoints").Indexes().CreateMany(ctx, []mongo.IndexModel{{
		Keys:    bson.D{{Key: "owner_id", Value: 1}, {Key: "name", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("endpoints_owner_name_unique"),
	}})
	if err != nil {
		return fmt.Errorf("creating endpoint indexes: %w", err)
	}
	return nil
}

func isIndexNotFound(err error) bool {
	var ce mongo.CommandError
	return errors.As(err, &ce) && (ce.Code == 27 || ce.Code == 26 || ce.Name == "IndexNotFound" || ce.Name == "NamespaceNotFound")
}
