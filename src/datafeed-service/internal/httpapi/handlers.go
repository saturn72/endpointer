// Package httpapi implements the datafeed-service HTTP handlers.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
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
	Datafeeds *mongo.Collection
	Versions  *mongo.Collection
	DB        *mongo.Database // for healthz ping
}

// ─── MongoDB document types ──────────────────────────────────────────────────

// endpointDoc holds the fields we read from the `endpoints` collection.
type endpointDoc struct {
	OwnerUsername string `bson:"owner_username"`
	Name          string `bson:"name"`
	DatafeedID    string `bson:"datafeed_id"` // hex of datafeeds._id
	VersionPolicy *struct {
		Mode  string `bson:"mode"` // "latest" | "pinned"
		Major int    `bson:"major"`
		Minor int    `bson:"minor"`
	} `bson:"version_policy"`
}

// datafeedDoc holds the fields we read from the `datafeeds` collection.
type datafeedDoc struct {
	AdapterConfig struct {
		IDField *string `bson:"id_field"` // nil when not configured
	} `bson:"adapter_config"`
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

// resolved is the result of walking user -> endpoint -> datafeed -> version.
type resolved struct {
	datafeed datafeedDoc
	version  *latestVersionDoc
}

// resolve writes the error response and returns ok=false when any hop fails.
// Route: /{user_name}/{endpoint_name}[/version/{version}]. An explicit version
// in the URL wins over the endpoint's version policy.
func (h *Handler) resolve(w http.ResponseWriter, r *http.Request) (res resolved, ok bool) {
	user := r.PathValue("user_name")
	name := r.PathValue("endpoint_name")

	var wantMajor, wantMinor *int
	if v := r.PathValue("version"); v != "" {
		major, minor, valid := ParseVersion(v)
		if !valid {
			writeError(w, http.StatusNotFound, "version not found")
			return res, false
		}
		wantMajor, wantMinor = &major, &minor
	}

	ep, err := h.lookupEndpoint(r.Context(), user, name)
	if err != nil {
		slog.Error("looking up endpoint", "user", user, "name", name, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return res, false
	}
	if ep == nil {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return res, false
	}

	if wantMajor == nil && ep.VersionPolicy != nil && ep.VersionPolicy.Mode == "pinned" {
		wantMajor, wantMinor = &ep.VersionPolicy.Major, &ep.VersionPolicy.Minor
	}

	df, err := h.lookupDatafeed(r.Context(), ep.DatafeedID)
	if err != nil {
		slog.Error("looking up datafeed", "datafeed", ep.DatafeedID, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return res, false
	}
	if df == nil {
		writeError(w, http.StatusNotFound, "no data available for this endpoint yet")
		return res, false
	}

	ver, err := h.lookupVersion(r.Context(), ep.DatafeedID, wantMajor, wantMinor)
	if err != nil {
		slog.Error("looking up version", "datafeed", ep.DatafeedID, "error", err)
		writeError(w, http.StatusInternalServerError, "internal server error")
		return res, false
	}
	if ver == nil {
		if wantMajor != nil {
			writeError(w, http.StatusNotFound, "version not found")
		} else {
			writeError(w, http.StatusNotFound, "no data available for this endpoint yet")
		}
		return res, false
	}
	return resolved{datafeed: *df, version: ver}, true
}

// GetAll handles GET /{user_name}/{endpoint_name}[/version/{version}]?offset=&limit=
func (h *Handler) GetAll(w http.ResponseWriter, r *http.Request) {
	res, ok := h.resolve(w, r)
	if !ok {
		return
	}
	ver := res.version

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

// GetByID handles GET /{user_name}/{endpoint_name}/{id}
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	res, ok := h.resolve(w, r)
	if !ok {
		return
	}
	idField := res.datafeed.AdapterConfig.IDField
	if idField == nil || *idField == "" {
		writeError(w, http.StatusBadRequest, "this endpoint has no id_field configured")
		return
	}

	content := bsonArrayToInterfaces(res.version.Content)
	record, found := FindByID(content, *idField, r.PathValue("id"))
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

func (h *Handler) lookupEndpoint(ctx context.Context, user, name string) (*endpointDoc, error) {
	var ep endpointDoc
	err := h.Endpoints.FindOne(ctx, bson.M{"owner_username": user, "name": name}).Decode(&ep)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("findOne endpoints %q/%q: %w", user, name, err)
	}
	return &ep, nil
}

func (h *Handler) lookupDatafeed(ctx context.Context, id string) (*datafeedDoc, error) {
	oid, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil // dangling or malformed reference: treat as no data
	}
	var df datafeedDoc
	err = h.Datafeeds.FindOne(ctx, bson.M{"_id": oid}).Decode(&df)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("findOne datafeeds %q: %w", id, err)
	}
	return &df, nil
}

// lookupVersion returns the exact version when major/minor are set, else the latest.
func (h *Handler) lookupVersion(ctx context.Context, datafeedID string, major, minor *int) (*latestVersionDoc, error) {
	filter := bson.M{"datafeed_id": datafeedID}
	opts := options.FindOne().SetSort(bson.D{{Key: "major", Value: -1}, {Key: "minor", Value: -1}})
	if major != nil && minor != nil {
		filter["major"] = *major
		filter["minor"] = *minor
	}
	var ver latestVersionDoc
	err := h.Versions.FindOne(ctx, filter, opts).Decode(&ver)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("findOne versions %q: %w", datafeedID, err)
	}
	return &ver, nil
}

var versionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+$`)

// ParseVersion parses "<major>.<minor>" (digits only, e.g. "1.3").
func ParseVersion(s string) (major, minor int, ok bool) {
	if !versionPattern.MatchString(s) {
		return 0, 0, false
	}
	var err1, err2 error
	for i, c := range s {
		if c == '.' {
			major, err1 = strconv.Atoi(s[:i])
			minor, err2 = strconv.Atoi(s[i+1:])
			break
		}
	}
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return major, minor, true
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
