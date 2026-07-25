//go:build integration

package httpapi_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/endpointer-platform/datafeed-service/internal/httpapi"
)

// These integration tests seed MongoDB directly and call the HTTP handlers via
// httptest. Run them with:
//
//	go test -tags=integration ./internal/httpapi/ -v
//
// Requires MONGODB_URI (and optionally MONGODB_DB) env vars pointing at a live
// MongoDB instance (e.g. the local docker-compose stack).

const integTestDB = "datafeed_integration_test"

func setupIntegration(t *testing.T) (*httpapi.Handler, func()) {
	t.Helper()
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		t.Skip("MONGODB_URI not set; skipping integration test")
	}

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	ctx := context.Background()
	if err := client.Ping(ctx, nil); err != nil {
		t.Fatalf("ping: %v", err)
	}

	db := client.Database(integTestDB)

	// Clean state before each test.
	db.Collection("endpoints").Drop(ctx)   //nolint:errcheck
	db.Collection("versions").Drop(ctx)    //nolint:errcheck

	h := &httpapi.Handler{
		Endpoints: db.Collection("endpoints"),
		Versions:  db.Collection("versions"),
		DB:        db,
	}

	cleanup := func() {
		db.Drop(ctx)        //nolint:errcheck
		client.Disconnect(ctx) //nolint:errcheck
	}
	return h, cleanup
}

// seedEndpoint inserts a minimal endpoint document.
func seedEndpoint(t *testing.T, col *mongo.Collection, name string, idField *string) {
	t.Helper()
	doc := bson.M{"name": name, "id_field": idField, "created_at": time.Now()}
	if _, err := col.InsertOne(context.Background(), doc); err != nil {
		t.Fatalf("seedEndpoint: %v", err)
	}
}

// seedVersion inserts a version document with inline content.
func seedVersion(t *testing.T, col *mongo.Collection, endpointName string, major, minor int, content interface{}, warnings []string) {
	t.Helper()
	doc := bson.M{
		"endpoint_name":    endpointName,
		"major":            major,
		"minor":            minor,
		"content":          content,
		"warnings":         warnings,
		"source_upload_key": fmt.Sprintf("%s/test-uuid/data.json", endpointName),
		"created_at":       time.Now(),
	}
	if _, err := col.InsertOne(context.Background(), doc); err != nil {
		t.Fatalf("seedVersion: %v", err)
	}
}

// doRequest fires r against h using httptest and returns the recorder.
func doRequest(t *testing.T, h *httpapi.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.Healthz)
	mux.HandleFunc("GET /{endpoint_name}", h.GetAll)
	mux.HandleFunc("GET /{endpoint_name}/{id}", h.GetByID)
	w := httptest.NewRecorder()
	r := httptest.NewRequest(method, path, nil)
	mux.ServeHTTP(w, r)
	return w
}

// ─── Integration test cases ──────────────────────────────────────────────────

func TestIntegration_GetAll_HappyPath(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "sku"
	seedEndpoint(t, h.Endpoints, "products", &idField)
	content := []interface{}{
		map[string]interface{}{"sku": "A1", "name": "Widget"},
		map[string]interface{}{"sku": "A2", "name": "Gadget"},
	}
	warnings := []string{"id_field 'sku' not found in 1 row(s)"}
	seedVersion(t, h.Versions, "products", 1, 0, content, warnings)

	w := doRequest(t, h, "GET", "/products")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d; want 200. body: %s", w.Code, w.Body)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	data := resp["data"].([]interface{})
	if len(data) != 2 {
		t.Errorf("data len = %d; want 2", len(data))
	}
	pagination := resp["pagination"].(map[string]interface{})
	if pagination["total"].(float64) != 2 {
		t.Errorf("pagination.total = %v; want 2", pagination["total"])
	}
	meta := resp["_meta"].(map[string]interface{})
	if meta["version"] != "1.0" {
		t.Errorf("_meta.version = %v; want 1.0", meta["version"])
	}
	metaWarnings := meta["warnings"].([]interface{})
	if len(metaWarnings) != 1 {
		t.Errorf("_meta.warnings len = %d; want 1", len(metaWarnings))
	}
}

func TestIntegration_GetAll_NoWarnings(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "id"
	seedEndpoint(t, h.Endpoints, "items", &idField)
	seedVersion(t, h.Versions, "items", 1, 2, []interface{}{
		map[string]interface{}{"id": "1", "val": "x"},
	}, []string{})

	w := doRequest(t, h, "GET", "/items")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d; want 200. body: %s", w.Code, w.Body)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	meta := resp["_meta"].(map[string]interface{})
	if meta["version"] != "1.2" {
		t.Errorf("_meta.version = %v; want 1.2", meta["version"])
	}
	if ws := meta["warnings"].([]interface{}); len(ws) != 0 {
		t.Errorf("warnings = %v; want empty", ws)
	}
}

func TestIntegration_GetAll_InvalidParams(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "id"
	seedEndpoint(t, h.Endpoints, "ep", &idField)
	seedVersion(t, h.Versions, "ep", 1, 0, []interface{}{}, []string{})

	for _, path := range []string{"/ep?offset=-1", "/ep?offset=abc"} {
		w := doRequest(t, h, "GET", path)
		if w.Code != http.StatusBadRequest {
			t.Errorf("path=%s status=%d; want 400", path, w.Code)
		}
	}
	for _, path := range []string{"/ep?limit=0", "/ep?limit=-5", "/ep?limit=xyz"} {
		w := doRequest(t, h, "GET", path)
		if w.Code != http.StatusBadRequest {
			t.Errorf("path=%s status=%d; want 400", path, w.Code)
		}
	}
}

func TestIntegration_GetByID_HappyPath(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "sku"
	seedEndpoint(t, h.Endpoints, "catalog", &idField)
	seedVersion(t, h.Versions, "catalog", 1, 0, []interface{}{
		map[string]interface{}{"sku": "X1", "price": "9.99"},
		map[string]interface{}{"sku": "X2", "price": "19.99"},
	}, []string{})

	w := doRequest(t, h, "GET", "/catalog/X2")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d; want 200. body: %s", w.Code, w.Body)
	}

	var record map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &record)
	if record["sku"] != "X2" {
		t.Errorf("sku = %v; want X2", record["sku"])
	}
}

func TestIntegration_GetByID_NoIDField(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	seedEndpoint(t, h.Endpoints, "noidep", nil) // nil = no id_field
	seedVersion(t, h.Versions, "noidep", 1, 0, []interface{}{
		map[string]interface{}{"name": "foo"},
	}, []string{})

	w := doRequest(t, h, "GET", "/noidep/somevalue")
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d; want 400", w.Code)
	}
}

func TestIntegration_GetByID_NotFound(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "id"
	seedEndpoint(t, h.Endpoints, "things", &idField)
	seedVersion(t, h.Versions, "things", 1, 0, []interface{}{
		map[string]interface{}{"id": "1"},
	}, []string{})

	w := doRequest(t, h, "GET", "/things/9999")
	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d; want 404", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "record not found" {
		t.Errorf("error = %v; want 'record not found'", resp["error"])
	}
}

func TestIntegration_NonexistentEndpoint(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	for _, path := range []string{"/doesnotexist", "/doesnotexist/42"} {
		w := doRequest(t, h, "GET", path)
		if w.Code != http.StatusNotFound {
			t.Errorf("path=%s status=%d; want 404", path, w.Code)
		}
		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["error"] != "endpoint not found" {
			t.Errorf("error = %v; want 'endpoint not found'", resp["error"])
		}
	}
}

func TestIntegration_NoVersionsYet(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "id"
	seedEndpoint(t, h.Endpoints, "empty", &idField)
	// No version seeded.

	for _, path := range []string{"/empty", "/empty/1"} {
		w := doRequest(t, h, "GET", path)
		if w.Code != http.StatusNotFound {
			t.Errorf("path=%s status=%d; want 404", path, w.Code)
		}
		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["error"] != "no data available for this endpoint yet" {
			t.Errorf("error = %v; want 'no data available for this endpoint yet'", resp["error"])
		}
	}
}

func TestIntegration_Pagination_LimitCappedAtMax(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "id"
	seedEndpoint(t, h.Endpoints, "big", &idField)
	content := make([]interface{}, 10)
	for i := range content {
		content[i] = map[string]interface{}{"id": fmt.Sprintf("%d", i+1)}
	}
	seedVersion(t, h.Versions, "big", 1, 0, content, []string{})

	// Request limit=999 (over MaxPageSize); should be capped.
	w := doRequest(t, h, "GET", fmt.Sprintf("/big?limit=%d", httpapi.MaxPageSize+100))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d; want 200", w.Code)
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	pagination := resp["pagination"].(map[string]interface{})
	// limit in response should be MaxPageSize (capped), not the requested value.
	if got := int(pagination["limit"].(float64)); got > httpapi.MaxPageSize {
		t.Errorf("response limit = %d; want <= %d", got, httpapi.MaxPageSize)
	}
}
