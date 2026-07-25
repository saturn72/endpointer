// Package httpapi implements the datafeed-service HTTP handlers.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Page size constants. Named here so handlers never contain magic numbers.
const (
	DefaultPageSize = 100
	MaxPageSize     = 500
)

// Handler groups the MongoDB collections needed by the HTTP handlers.
type Handler struct {
	Endpoints *mongo.Collection
	Versions  *mongo.Collection
	DB        *mongo.Database // for healthz ping
}

// ─── MongoDB document types ──────────────────────────────────────────────────

// endpointDoc holds the fields we read from the `endpoints` collection.
type endpointDoc struct {
	Name    string  `bson:"name"`
	IDField *string `bson:"id_field"` // nil when not configured
}

// latestVersionDoc holds the fields we read from the `versions` collection.
type latestVersionDoc struct {
	Major    int      `bson:"major"`
	Minor    int      `bson:"minor"`
	Content  bson.A   `bson:"content"`
	Warnings []string `bson:"warnings"`
}

// ─── Response types ──────────────────────────────────────────────────────────

type getAllResponse struct {
	Data       []interface{}  `json:"data"`
	Pagination paginationMeta `json:"pagination"`
	Meta       versionMeta    `json:"_meta"`
}

type paginationMeta struct {
	Offset int `json:"offset"`
	Limit  int `json:"limit"`
	Total  int `json:"total"`
}

type versionMeta struct {
	Version  string   `json:"version"`
	Warnings []string `json:"warnings"`
}

type errorResponse struct {
	Error string `json:"error"`
}

// ─── Handlers ────────────────────────────────────────────────────────────────

// Healthz checks MongoDB connectivity and returns 200/503.
func (h *Handler) Healthz(w http.ResponseWriter, r *http.Request) {
	if err := h.DB.Client().Ping(r.Context(), nil); err != nil {
		slog.Error("healthz: MongoDB ping failed", "error", err)
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`)) //nolint:errcheck
}

// GetAll handles GET /{endpoint_name}?offset=&limit=
func (h *Handler) GetAll(w http.ResponseWriter, r *http.Request) {
	endpointName := r.PathValue("endpoint_name")

	ep, err := h.lookupEndpoint(r.Context(), endpointName)
	if err != nil {
		slog.Error("looking up endpoint", "name", endpointName, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if ep == nil {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}

	ver, err := h.lookupLatestVersion(r.Context(), endpointName)
	if err != nil {
		slog.Error("looking up latest version", "endpoint", endpointName, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if ver == nil {
		writeError(w, http.StatusNotFound, "no data available for this endpoint yet")
		return
	}

	offset, limit, ok := parsePagination(r, w)
	if !ok {
		return
	}

	content := bsonArrayToInterfaces(ver.Content)
	total := len(content)
	take := ComputePagination(offset, limit, total)

	var pageData []interface{}
	if take > 0 {
		pageData = content[offset : offset+take]
	} else {
		pageData = []interface{}{}
	}

	warnings := ver.Warnings
	if warnings == nil {
		warnings = []string{}
	}

	writeJSON(w, http.StatusOK, getAllResponse{
		Data: pageData,
		Pagination: paginationMeta{
			Offset: offset,
			Limit:  limit,
			Total:  total,
		},
		Meta: versionMeta{
			Version:  fmt.Sprintf("%d.%d", ver.Major, ver.Minor),
			Warnings: warnings,
		},
	})
}

// GetByID handles GET /{endpoint_name}/{id}
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	endpointName := r.PathValue("endpoint_name")
	id := r.PathValue("id")

	ep, err := h.lookupEndpoint(r.Context(), endpointName)
	if err != nil {
		slog.Error("looking up endpoint", "name", endpointName, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if ep == nil {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}

	if ep.IDField == nil || *ep.IDField == "" {
		writeError(w, http.StatusBadRequest, "this endpoint has no id_field configured")
		return
	}

	ver, err := h.lookupLatestVersion(r.Context(), endpointName)
	if err != nil {
		slog.Error("looking up latest version", "endpoint", endpointName, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if ver == nil {
		writeError(w, http.StatusNotFound, "no data available for this endpoint yet")
		return
	}

	content := bsonArrayToInterfaces(ver.Content)
	record, found := FindByID(content, *ep.IDField, id)
	if !found {
		writeError(w, http.StatusNotFound, "record not found")
		return
	}

	writeJSON(w, http.StatusOK, record)
}

// ─── Pure helper functions (exported for testing) ────────────────────────────

// ComputePagination returns the number of records to return (take) for a given
// offset/limit/total. Returns 0 when there are no records, limit is zero, or
// offset is at or beyond the end.
func ComputePagination(offset, limit, total int) (take int) {
	if total == 0 || limit == 0 || offset >= total {
		return 0
	}
	take = limit
	if offset+take > total {
		take = total - offset
	}
	return take
}

// FindByID scans content for a record where record[idField] == id.
// Uses fmt.Sprintf for comparison so both string and numeric stored values match.
// content should be []interface{} where each element is map[string]interface{}
// (i.e. the output of bsonArrayToInterfaces).
func FindByID(content []interface{}, idField, id string) (interface{}, bool) {
	for _, item := range content {
		record, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		v, ok := record[idField]
		if !ok {
			continue
		}
		if fmt.Sprintf("%v", v) == id {
			return item, true
		}
	}
	return nil, false
}

// ─── Private helpers ─────────────────────────────────────────────────────────

func (h *Handler) lookupEndpoint(ctx context.Context, name string) (*endpointDoc, error) {
	var ep endpointDoc
	err := h.Endpoints.FindOne(ctx, bson.M{"name": name}).Decode(&ep)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("findOne endpoints %q: %w", name, err)
	}
	return &ep, nil
}

func (h *Handler) lookupLatestVersion(ctx context.Context, endpointName string) (*latestVersionDoc, error) {
	var ver latestVersionDoc
	opts := options.FindOne().SetSort(bson.D{{Key: "major", Value: -1}, {Key: "minor", Value: -1}})
	err := h.Versions.FindOne(ctx, bson.M{"endpoint_name": endpointName}, opts).Decode(&ver)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("findOne versions %q: %w", endpointName, err)
	}
	return &ver, nil
}

// parsePagination reads offset and limit from the query string.
// Writes a 400 error to w and returns ok=false on invalid input.
func parsePagination(r *http.Request, w http.ResponseWriter) (offset, limit int, ok bool) {
	offset = 0
	limit = DefaultPageSize

	if s := r.URL.Query().Get("offset"); s != "" {
		o, err := strconv.Atoi(s)
		if err != nil || o < 0 {
			writeError(w, http.StatusBadRequest, "offset must be a non-negative integer")
			return 0, 0, false
		}
		offset = o
	}
	if s := r.URL.Query().Get("limit"); s != "" {
		l, err := strconv.Atoi(s)
		if err != nil || l < 1 {
			writeError(w, http.StatusBadRequest, "limit must be a positive integer")
			return 0, 0, false
		}
		if l > MaxPageSize {
			l = MaxPageSize
		}
		limit = l
	}
	return offset, limit, true
}

// bsonArrayToInterfaces converts a bson.A (BSON array) to []interface{} where
// nested BSON documents (bson.D) are recursively converted to map[string]interface{}.
// This is required because encoding/json serializes bson.D as a JSON array of
// key-value pairs, not as an object.
func bsonArrayToInterfaces(a bson.A) []interface{} {
	result := make([]interface{}, len(a))
	for i, item := range a {
		result[i] = bsonToInterface(item)
	}
	return result
}

func bsonToInterface(v interface{}) interface{} {
	switch val := v.(type) {
	case bson.D:
		m := make(map[string]interface{}, len(val))
		for _, e := range val {
			m[e.Key] = bsonToInterface(e.Value)
		}
		return m
	case bson.A:
		arr := make([]interface{}, len(val))
		for i, item := range val {
			arr[i] = bsonToInterface(item)
		}
		return arr
	default:
		return v
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(errorResponse{Error: msg}) //nolint:errcheck
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}
