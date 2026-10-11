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
// Requires MONGODB_URI pointing at a live MongoDB instance (e.g. the local
// docker-compose stack).

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
	db.Drop(ctx) //nolint:errcheck

	h := &httpapi.Handler{
		Endpoints: db.Collection("endpoints"),
		Datafeeds: db.Collection("datafeeds"),
		Versions:  db.Collection("versions"),
		DB:        db,
	}
	cleanup := func() {
		db.Drop(ctx)           //nolint:errcheck
		client.Disconnect(ctx) //nolint:errcheck
	}
	return h, cleanup
}

// seedDatafeed inserts a datafeed and returns its hex id.
func seedDatafeed(t *testing.T, h *httpapi.Handler, idField *string) string {
	t.Helper()
	res, err := h.Datafeeds.InsertOne(context.Background(), bson.M{
		"adapter":        "static-file",
		"adapter_config": bson.M{"id_field": idField},
		"created_at":     time.Now(),
	})
	if err != nil {
		t.Fatalf("seedDatafeed: %v", err)
	}
	return res.InsertedID.(bson.ObjectID).Hex()
}

// seedEndpoint inserts an endpoint pointing at datafeedID. policy may be nil (latest).
func seedEndpoint(t *testing.T, h *httpapi.Handler, user, name, datafeedID string, policy bson.M) {
	t.Helper()
	doc := bson.M{
		"owner_username": user,
		"name":           name,
		"datafeed_id":    datafeedID,
		"created_at":     time.Now(),
	}
	if policy != nil {
		doc["version_policy"] = policy
	}
	if _, err := h.Endpoints.InsertOne(context.Background(), doc); err != nil {
		t.Fatalf("seedEndpoint: %v", err)
	}
}

// seedVersion inserts a version document with inline content.
func seedVersion(t *testing.T, h *httpapi.Handler, datafeedID string, major, minor int, content interface{}, warnings []string) {
	t.Helper()
	doc := bson.M{
		"datafeed_id":       datafeedID,
		"major":             major,
		"minor":             minor,
		"content":           content,
		"warnings":          warnings,
		"source_upload_key": fmt.Sprintf("%s/test-uuid/data.json", datafeedID),
		"created_at":        time.Now(),
	}
	if _, err := h.Versions.InsertOne(context.Background(), doc); err != nil {
		t.Fatalf("seedVersion: %v", err)
	}
}

// doRequest mirrors the routing in cmd/datafeed-service/main.go.
func doRequest(t *testing.T, h *httpapi.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.Healthz)
	mux.HandleFunc("GET /{user_name}/{endpoint_name}", h.GetAll)
	mux.HandleFunc("GET /{user_name}/{endpoint_name}/version/{version}", h.GetAll)
	mux.HandleFunc("GET /{user_name}/{endpoint_name}/{id}", h.GetByID)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal %q: %v", w.Body.String(), err)
	}
	return resp
}

func versionOf(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	return decode(t, w)["_meta"].(map[string]interface{})["version"].(string)
}

// ─── Integration test cases ──────────────────────────────────────────────────

func TestIntegration_GetAll_HappyPath(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "sku"
	dfID := seedDatafeed(t, h, &idField)
	seedEndpoint(t, h, "alice", "products", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{
		map[string]interface{}{"sku": "A1", "name": "Widget"},
		map[string]interface{}{"sku": "A2", "name": "Gadget"},
	}, []string{"id_field 'sku' not found in 1 row(s)"})

	w := doRequest(t, h, "/alice/products")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d; want 200. body: %s", w.Code, w.Body)
	}
	resp := decode(t, w)
	if n := len(resp["data"].([]interface{})); n != 2 {
		t.Errorf("data len = %d; want 2", n)
	}
	if total := resp["pagination"].(map[string]interface{})["total"].(float64); total != 2 {
		t.Errorf("pagination.total = %v; want 2", total)
	}
	meta := resp["_meta"].(map[string]interface{})
	if meta["version"] != "1.0" {
		t.Errorf("_meta.version = %v; want 1.0", meta["version"])
	}
	if n := len(meta["warnings"].([]interface{})); n != 1 {
		t.Errorf("_meta.warnings len = %d; want 1", n)
	}
}

func TestIntegration_LatestVersionIsServed(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "items", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{}, []string{})
	seedVersion(t, h, dfID, 1, 2, []interface{}{}, []string{})
	seedVersion(t, h, dfID, 2, 0, []interface{}{}, []string{})

	if got := versionOf(t, doRequest(t, h, "/alice/items")); got != "2.0" {
		t.Errorf("latest version = %s; want 2.0", got)
	}
}

func TestIntegration_ExplicitVersion(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "items", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{map[string]interface{}{"v": "old"}}, []string{})
	seedVersion(t, h, dfID, 1, 1, []interface{}{map[string]interface{}{"v": "new"}}, []string{})

	w := doRequest(t, h, "/alice/items/version/1.0")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d; want 200. body: %s", w.Code, w.Body)
	}
	if got := versionOf(t, w); got != "1.0" {
		t.Errorf("version = %s; want 1.0", got)
	}
	rec := decode(t, w)["data"].([]interface{})[0].(map[string]interface{})
	if rec["v"] != "old" {
		t.Errorf("record = %v; want old content", rec)
	}
}

func TestIntegration_ExplicitVersion_NotFoundAndMalformed(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "items", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{}, []string{})

	for _, v := range []string{"9.9", "1", "v1.0", "1.0.0", "a.b", "-1.0", "latest"} {
		w := doRequest(t, h, "/alice/items/version/"+v)
		if w.Code != http.StatusNotFound {
			t.Errorf("version=%q status=%d; want 404", v, w.Code)
		}
		if got := decode(t, w)["error"]; got != "version not found" {
			t.Errorf("version=%q error=%v; want 'version not found'", v, got)
		}
	}
}

func TestIntegration_PinnedPolicy(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "items", dfID, bson.M{"mode": "pinned", "major": 1, "minor": 0})
	seedVersion(t, h, dfID, 1, 0, []interface{}{}, []string{})
	seedVersion(t, h, dfID, 2, 0, []interface{}{}, []string{})

	if got := versionOf(t, doRequest(t, h, "/alice/items")); got != "1.0" {
		t.Errorf("pinned endpoint served %s; want 1.0", got)
	}
	// An explicit version in the URL wins over the policy.
	if got := versionOf(t, doRequest(t, h, "/alice/items/version/2.0")); got != "2.0" {
		t.Errorf("explicit version served %s; want 2.0", got)
	}
}

func TestIntegration_PinnedToMissingVersion(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "items", dfID, bson.M{"mode": "pinned", "major": 7, "minor": 7})
	seedVersion(t, h, dfID, 1, 0, []interface{}{}, []string{})

	if w := doRequest(t, h, "/alice/items"); w.Code != http.StatusNotFound {
		t.Errorf("status = %d; want 404", w.Code)
	}
}

func TestIntegration_EndpointNamesAreScopedPerUser(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	df1 := seedDatafeed(t, h, nil)
	df2 := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "products", df1, nil)
	seedEndpoint(t, h, "bob", "products", df2, nil)
	seedVersion(t, h, df1, 1, 0, []interface{}{map[string]interface{}{"owner": "alice"}}, []string{})
	seedVersion(t, h, df2, 3, 0, []interface{}{map[string]interface{}{"owner": "bob"}}, []string{})

	for user, wantVer := range map[string]string{"alice": "1.0", "bob": "3.0"} {
		w := doRequest(t, h, "/"+user+"/products")
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status = %d; want 200", user, w.Code)
		}
		if got := versionOf(t, w); got != wantVer {
			t.Errorf("%s: version = %s; want %s", user, got, wantVer)
		}
		rec := decode(t, w)["data"].([]interface{})[0].(map[string]interface{})
		if rec["owner"] != user {
			t.Errorf("%s got data of %v", user, rec["owner"])
		}
	}

	if w := doRequest(t, h, "/carol/products"); w.Code != http.StatusNotFound {
		t.Errorf("carol status = %d; want 404", w.Code)
	}
}

func TestIntegration_TwoEndpointsShareOneDatafeed(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "prices", dfID, nil)
	seedEndpoint(t, h, "alice", "inventory", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{map[string]interface{}{"x": 1}}, []string{})

	for _, name := range []string{"prices", "inventory"} {
		if w := doRequest(t, h, "/alice/"+name); w.Code != http.StatusOK {
			t.Errorf("%s status = %d; want 200", name, w.Code)
		}
	}
}

func TestIntegration_GetAll_InvalidParams(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "ep", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{}, []string{})

	for _, q := range []string{"offset=-1", "offset=abc", "limit=0", "limit=-5", "limit=xyz"} {
		w := doRequest(t, h, "/alice/ep?"+q)
		if w.Code != http.StatusBadRequest {
			t.Errorf("query=%s status=%d; want 400", q, w.Code)
		}
	}
}

func TestIntegration_GetByID_HappyPath(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "sku"
	dfID := seedDatafeed(t, h, &idField)
	seedEndpoint(t, h, "alice", "catalog", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{
		map[string]interface{}{"sku": "X1", "price": "9.99"},
		map[string]interface{}{"sku": "X2", "price": "19.99"},
	}, []string{})

	w := doRequest(t, h, "/alice/catalog/X2")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d; want 200. body: %s", w.Code, w.Body)
	}
	if got := decode(t, w)["sku"]; got != "X2" {
		t.Errorf("sku = %v; want X2", got)
	}
}

func TestIntegration_GetByID_NoIDField(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "noidep", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{map[string]interface{}{"name": "foo"}}, []string{})

	if w := doRequest(t, h, "/alice/noidep/somevalue"); w.Code != http.StatusBadRequest {
		t.Errorf("status = %d; want 400", w.Code)
	}
}

func TestIntegration_GetByID_NotFound(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "id"
	dfID := seedDatafeed(t, h, &idField)
	seedEndpoint(t, h, "alice", "things", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{map[string]interface{}{"id": "1"}}, []string{})

	w := doRequest(t, h, "/alice/things/9999")
	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d; want 404", w.Code)
	}
	if got := decode(t, w)["error"]; got != "record not found" {
		t.Errorf("error = %v; want 'record not found'", got)
	}
}

func TestIntegration_NonexistentEndpoint(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	for _, path := range []string{"/alice/doesnotexist", "/alice/doesnotexist/42", "/alice/doesnotexist/version/1.0"} {
		w := doRequest(t, h, path)
		if w.Code != http.StatusNotFound {
			t.Errorf("path=%s status=%d; want 404", path, w.Code)
		}
		if got := decode(t, w)["error"]; got != "endpoint not found" {
			t.Errorf("path=%s error=%v; want 'endpoint not found'", path, got)
		}
	}
}

func TestIntegration_LegacyRouteRetired(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "products", dfID, nil)
	seedVersion(t, h, dfID, 1, 0, []interface{}{}, []string{})

	if w := doRequest(t, h, "/products"); w.Code != http.StatusNotFound {
		t.Errorf("legacy /{endpoint_name} status = %d; want 404", w.Code)
	}
}

func TestIntegration_NoVersionsYet(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	idField := "id"
	dfID := seedDatafeed(t, h, &idField)
	seedEndpoint(t, h, "alice", "empty", dfID, nil)

	for _, path := range []string{"/alice/empty", "/alice/empty/1"} {
		w := doRequest(t, h, path)
		if w.Code != http.StatusNotFound {
			t.Errorf("path=%s status=%d; want 404", path, w.Code)
		}
		if got := decode(t, w)["error"]; got != "no data available for this endpoint yet" {
			t.Errorf("path=%s error=%v", path, got)
		}
	}
}

func TestIntegration_DanglingDatafeedReference(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	seedEndpoint(t, h, "alice", "orphan", "not-an-object-id", nil)
	if w := doRequest(t, h, "/alice/orphan"); w.Code != http.StatusNotFound {
		t.Errorf("status = %d; want 404", w.Code)
	}
}

func TestIntegration_Pagination_LimitCappedAtMax(t *testing.T) {
	h, cleanup := setupIntegration(t)
	defer cleanup()

	dfID := seedDatafeed(t, h, nil)
	seedEndpoint(t, h, "alice", "big", dfID, nil)
	content := make([]interface{}, 10)
	for i := range content {
		content[i] = map[string]interface{}{"id": fmt.Sprintf("%d", i+1)}
	}
	seedVersion(t, h, dfID, 1, 0, content, []string{})

	w := doRequest(t, h, fmt.Sprintf("/alice/big?limit=%d", httpapi.MaxPageSize+100))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d; want 200", w.Code)
	}
	got := int(decode(t, w)["pagination"].(map[string]interface{})["limit"].(float64))
	if got > httpapi.MaxPageSize {
		t.Errorf("response limit = %d; want <= %d", got, httpapi.MaxPageSize)
	}
}
