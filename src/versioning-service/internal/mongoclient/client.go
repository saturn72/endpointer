// Package mongoclient provides a thin MongoDB client factory.
//
// This package exists purely to keep wiring code out of main.go. Do not add
// query helpers or repository methods here — callers should use the mongo
// driver directly.
package mongoclient

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Config holds the MongoDB connection parameters.
type Config struct {
	URI string
	DB  string
}

// New connects to MongoDB, verifies the connection with a ping, and returns
// the client and the named database. The caller is responsible for calling
// client.Disconnect when done.
func New(ctx context.Context, cfg Config) (*mongo.Client, *mongo.Database, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(cfg.URI))
	if err != nil {
		return nil, nil, fmt.Errorf("connecting to MongoDB: %w", err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, nil, fmt.Errorf("pinging MongoDB: %w", err)
	}
	return client, client.Database(cfg.DB), nil
}
