//go:build integration

package main

import (
	"bytes"
	"context"
	"os"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/endpointer-platform/versioning-service/internal/blobclient"
)

// Needs MONGODB_URI, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (local docker-compose stack):
//
//	go test -tags=integration ./cmd/versioning-service/ -v

const testBucket = "converted-feeds-it"

func setup(t *testing.T) (context.Context, *s3.Client, *mongo.Collection, func()) {
	t.Helper()
	uri, ep := os.Getenv("MONGODB_URI"), os.Getenv("S3_ENDPOINT")
	if uri == "" || ep == "" {
		t.Skip("MONGODB_URI / S3_ENDPOINT not set")
	}
	ctx := context.Background()

	mc, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatal(err)
	}
	db := mc.Database("versioning_integration_test")
	db.Drop(ctx) //nolint:errcheck
	col := db.Collection("versions")

	s3c := blobclient.New(blobclient.Config{
		Endpoint:        ep,
		Region:          "us-east-1",
		AccessKeyID:     os.Getenv("S3_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("S3_SECRET_ACCESS_KEY"),
	})
	s3c.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(testBucket)}) //nolint:errcheck

	return ctx, s3c, col, func() {
		db.Drop(ctx)       //nolint:errcheck
		mc.Disconnect(ctx) //nolint:errcheck
	}
}

func put(t *testing.T, ctx context.Context, s3c *s3.Client, key, body string) {
	t.Helper()
	_, err := s3c.PutObject(ctx, &s3.PutObjectInput{
		Bucket:   aws.String(testBucket),
		Key:      aws.String(key),
		Body:     bytes.NewReader([]byte(body)),
		Metadata: map[string]string{"filename": "products.csv", "warnings": `["w1"]`},
	})
	if err != nil {
		t.Fatalf("put %s: %v", key, err)
	}
}

func gone(ctx context.Context, s3c *s3.Client, key string) bool {
	_, err := s3c.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(testBucket), Key: aws.String(key)})
	return err != nil
}

func TestProcessEvent_StoresVersionKeyedByDatafeed(t *testing.T) {
	ctx, s3c, col, cleanup := setup(t)
	defer cleanup()

	key := "64b7f0c2a1b2c3d4e5f60718/upload-1/data.json"
	put(t, ctx, s3c, key, `[{"id":"1"}]`)

	if err := processEvent(ctx, s3c, col, testBucket, key); err != nil {
		t.Fatalf("processEvent: %v", err)
	}

	var doc bson.M
	if err := col.FindOne(ctx, bson.M{"datafeed_id": "64b7f0c2a1b2c3d4e5f60718"}).Decode(&doc); err != nil {
		t.Fatalf("version not found by datafeed_id: %v", err)
	}
	if doc["upload_id"] != "upload-1" {
		t.Errorf("upload_id = %v; want upload-1", doc["upload_id"])
	}
	if _, has := doc["endpoint_name"]; has {
		t.Errorf("legacy endpoint_name must not be written")
	}
	if doc["filename"] != "products.csv" {
		t.Errorf("filename = %v", doc["filename"])
	}
	if doc["major"] != int32(1) || doc["minor"] != int32(0) {
		t.Errorf("version = %v.%v; want 1.0", doc["major"], doc["minor"])
	}
	if !gone(ctx, s3c, key) {
		t.Errorf("converted object should be deleted after processing")
	}
}

func TestProcessEvent_VersionsAreCountedPerDatafeed(t *testing.T) {
	ctx, s3c, col, cleanup := setup(t)
	defer cleanup()

	for _, k := range []string{"dfA/u1/data.json", "dfA/u2/data.json", "dfB/u1/data.json"} {
		put(t, ctx, s3c, k, `[]`)
		if err := processEvent(ctx, s3c, col, testBucket, k); err != nil {
			t.Fatalf("processEvent %s: %v", k, err)
		}
	}

	want := map[string]int{"dfA": 2, "dfB": 1}
	for df, n := range want {
		got, _ := col.CountDocuments(ctx, bson.M{"datafeed_id": df})
		if int(got) != n {
			t.Errorf("%s has %d versions; want %d", df, got, n)
		}
	}
	// dfB must start at 1.0 regardless of dfA's history.
	var doc bson.M
	col.FindOne(ctx, bson.M{"datafeed_id": "dfB"}).Decode(&doc) //nolint:errcheck
	if doc["major"] != int32(1) || doc["minor"] != int32(0) {
		t.Errorf("dfB first version = %v.%v; want 1.0", doc["major"], doc["minor"])
	}
	// dfA's second version must differ from its first.
	if c, _ := col.CountDocuments(ctx, bson.M{"datafeed_id": "dfA", "major": 1, "minor": 0}); c != 1 {
		t.Errorf("dfA 1.0 count = %d; want 1", c)
	}
}

func TestProcessEvent_RejectsMalformedKey(t *testing.T) {
	ctx, s3c, col, cleanup := setup(t)
	defer cleanup()

	if err := processEvent(ctx, s3c, col, testBucket, "only-two/parts"); err == nil {
		t.Errorf("expected error for key without datafeed/uuid/file")
	}
}

func TestEnsureIndex_DropsLegacyAndEnforcesUniqueness(t *testing.T) {
	ctx, _, col, cleanup := setup(t)
	defer cleanup()

	// Legacy unique index that would collide on documents without endpoint_name.
	_, err := col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "endpoint_name", Value: 1}, {Key: "major", Value: 1}, {Key: "minor", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("versions_unique_version"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := ensureIndex(ctx, col); err != nil {
		t.Fatalf("ensureIndex: %v", err)
	}
	// Idempotent.
	if err := ensureIndex(ctx, col); err != nil {
		t.Fatalf("ensureIndex second call: %v", err)
	}

	// Different datafeeds, same major.minor, no endpoint_name: must be allowed.
	for _, df := range []string{"a", "b"} {
		if _, err := col.InsertOne(ctx, bson.M{"datafeed_id": df, "major": 1, "minor": 0}); err != nil {
			t.Fatalf("insert for %s: %v", df, err)
		}
	}
	// Same datafeed and version: must be rejected.
	if _, err := col.InsertOne(ctx, bson.M{"datafeed_id": "a", "major": 1, "minor": 0}); !mongo.IsDuplicateKeyError(err) {
		t.Errorf("duplicate (datafeed, version) should violate the unique index, got %v", err)
	}
}
