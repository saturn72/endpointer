package manager

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const uploadURLExpiry = 5 * time.Minute

type Handler struct {
	Datafeeds *mongo.Collection
	Endpoints *mongo.Collection
	DB        *mongo.Database
	Presigner *s3.PresignClient
	Bucket    string
	Now       func() time.Time
}

type datafeedDoc struct {
	ID            bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	OwnerID       string        `bson:"owner_id" json:"owner_id"`
	Name          string        `bson:"name" json:"name"`
	Description   string        `bson:"description" json:"description"`
	Adapter       string        `bson:"adapter" json:"adapter"`
	AdapterConfig struct {
		IDField *string `bson:"id_field" json:"id_field"`
	} `bson:"adapter_config" json:"adapter_config"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type endpointDoc struct {
	ID            bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	OwnerID       string        `bson:"owner_id" json:"owner_id"`
	OwnerUsername string        `bson:"owner_username,omitempty" json:"owner_username,omitempty"`
	Name          string        `bson:"name" json:"name"`
	DatafeedID    string        `bson:"datafeed_id" json:"datafeed_id"`
	VersionPolicy struct {
		Mode  string `bson:"mode" json:"mode"`
		Major int    `bson:"major,omitempty" json:"major,omitempty"`
		Minor int    `bson:"minor,omitempty" json:"minor,omitempty"`
	} `bson:"version_policy" json:"version_policy"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

type datafeedInput struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	Adapter       string `json:"adapter"`
	AdapterConfig struct {
		IDField *string `json:"id_field"`
	} `json:"adapter_config"`
}

type endpointInput struct {
	Name       string `json:"name"`
	DatafeedID string `json:"datafeed_id"`
}

type uploadInput struct {
	Filename    string `json:"filename"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
}

type uploadResponse struct {
	URL       string            `json:"url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	Key       string            `json:"key"`
	Format    string            `json:"format"`
	ExpiresIn int               `json:"expires_in"`
}

func (h *Handler) Healthz(w http.ResponseWriter, r *http.Request) {
	if err := h.DB.Client().Ping(r.Context(), nil); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) CreateDatafeed(w http.ResponseWriter, r *http.Request) {
	ownerID, _, ok := ownerHeaders(w, r)
	if !ok {
		return
	}
	var input datafeedInput
	if !decode(w, r, &input) {
		return
	}
	if err := validateDatafeed(input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	now := h.now()
	doc := datafeedDoc{OwnerID: ownerID, Name: input.Name, Description: input.Description, Adapter: "static-file", CreatedAt: now, UpdatedAt: now}
	doc.AdapterConfig.IDField = input.AdapterConfig.IDField
	result, err := h.Datafeeds.InsertOne(r.Context(), doc)
	if err != nil {
		writeMongoError(w, err, "datafeed")
		return
	}
	doc.ID = result.InsertedID.(bson.ObjectID)
	writeJSON(w, http.StatusCreated, doc)
}

func (h *Handler) ListDatafeeds(w http.ResponseWriter, r *http.Request) {
	ownerID, _, ok := ownerHeaders(w, r)
	if !ok {
		return
	}
	cursor, err := h.Datafeeds.Find(r.Context(), bson.M{"owner_id": ownerID}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list datafeeds")
		return
	}
	docs := []datafeedDoc{}
	if err := cursor.All(r.Context(), &docs); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read datafeeds")
		return
	}
	writeJSON(w, http.StatusOK, nonNil(docs))
}

// nonNil keeps empty lists serialised as [] rather than null.
func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

func (h *Handler) GetDatafeed(w http.ResponseWriter, r *http.Request) {
	ownerID, _, ok := ownerHeaders(w, r)
	if !ok {
		return
	}
	id, err := bson.ObjectIDFromHex(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "datafeed not found")
		return
	}
	var doc datafeedDoc
	if err := h.Datafeeds.FindOne(r.Context(), bson.M{"_id": id, "owner_id": ownerID}).Decode(&doc); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			writeError(w, http.StatusNotFound, "datafeed not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to read datafeed")
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func (h *Handler) CreateEndpoint(w http.ResponseWriter, r *http.Request) {
	ownerID, username, ok := ownerHeaders(w, r)
	if !ok {
		return
	}
	var input endpointInput
	if !decode(w, r, &input) {
		return
	}
	if err := ValidateName(input.Name, "Endpoint name"); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.DatafeedID == "" {
		var dfInput datafeedInput
		if err := json.Unmarshal(mustJSON(input), &dfInput); err != nil {
			writeError(w, http.StatusBadRequest, "datafeed_id is required")
			return
		}
		_ = dfInput
	}
	if input.DatafeedID == "" {
		writeError(w, http.StatusBadRequest, "datafeed_id is required")
		return
	}
	dfID, err := bson.ObjectIDFromHex(input.DatafeedID)
	if err != nil {
		writeError(w, http.StatusNotFound, "datafeed not found")
		return
	}
	if err := h.Datafeeds.FindOne(r.Context(), bson.M{"_id": dfID, "owner_id": ownerID}).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			writeError(w, http.StatusNotFound, "datafeed not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to read datafeed")
		return
	}
	now := h.now()
	doc := endpointDoc{OwnerID: ownerID, OwnerUsername: username, Name: input.Name, DatafeedID: input.DatafeedID, CreatedAt: now, UpdatedAt: now}
	doc.VersionPolicy.Mode = "latest"
	result, err := h.Endpoints.InsertOne(r.Context(), doc)
	if err != nil {
		writeMongoError(w, err, "endpoint")
		return
	}
	doc.ID = result.InsertedID.(bson.ObjectID)
	writeJSON(w, http.StatusCreated, doc)
}

func (h *Handler) ListEndpoints(w http.ResponseWriter, r *http.Request) {
	ownerID, _, ok := ownerHeaders(w, r)
	if !ok {
		return
	}
	cursor, err := h.Endpoints.Find(r.Context(), bson.M{"owner_id": ownerID}, options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list endpoints")
		return
	}
	docs := []endpointDoc{}
	if err := cursor.All(r.Context(), &docs); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read endpoints")
		return
	}
	writeJSON(w, http.StatusOK, nonNil(docs))
}

func (h *Handler) GetEndpoint(w http.ResponseWriter, r *http.Request) {
	ownerID, _, ok := ownerHeaders(w, r)
	if !ok {
		return
	}
	var doc endpointDoc
	if err := h.Endpoints.FindOne(r.Context(), bson.M{"owner_id": ownerID, "name": r.PathValue("name")}).Decode(&doc); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			writeError(w, http.StatusNotFound, "endpoint not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to read endpoint")
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func (h *Handler) GetUploadURL(w http.ResponseWriter, r *http.Request) {
	ownerID, _, ok := ownerHeaders(w, r)
	if !ok {
		return
	}
	var input uploadInput
	if !decode(w, r, &input) {
		return
	}
	format, err := UploadFormat(input.Filename, input.ContentType, input.Size)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	dfID := r.PathValue("id")
	objectID, err := bson.ObjectIDFromHex(dfID)
	if err != nil {
		writeError(w, http.StatusNotFound, "datafeed not found")
		return
	}
	var found datafeedDoc
	if err := h.Datafeeds.FindOne(r.Context(), bson.M{"_id": objectID, "owner_id": ownerID}).Decode(&found); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			writeError(w, http.StatusNotFound, "datafeed not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to read datafeed")
		return
	}
	key := fmt.Sprintf("raw-uploads/%s/%s/%s", ownerID, dfID, newUUID())
	request, err := h.Presigner.PresignPutObject(r.Context(), &s3.PutObjectInput{Bucket: aws.String(h.Bucket), Key: aws.String(key), ContentType: aws.String(input.ContentType)}, s3.WithPresignExpires(uploadURLExpiry))
	if err != nil {
		slog.Error("presigning upload", "error", err)
		writeError(w, http.StatusInternalServerError, "upload could not be prepared")
		return
	}
	writeJSON(w, http.StatusOK, uploadResponse{URL: request.URL, Method: http.MethodPut, Headers: map[string]string{"Content-Type": input.ContentType}, Key: key, Format: format, ExpiresIn: int(uploadURLExpiry.Seconds())})
}

func (h *Handler) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now().UTC()
}

func validateDatafeed(input datafeedInput) error {
	if err := ValidateName(input.Name, "Datafeed name"); err != nil {
		return err
	}
	if len(input.Description) > MaxDescriptionLength {
		return fmt.Errorf("description must be %d characters or fewer", MaxDescriptionLength)
	}
	if input.Adapter != "" && input.Adapter != "static-file" {
		return fmt.Errorf("only the static-file adapter is supported")
	}
	return ValidateIDField(pointerValue(input.AdapterConfig.IDField))
}

func pointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
func newUUID() string { return fmt.Sprintf("%d", time.Now().UnixNano()) }

func ownerHeaders(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	id, username := strings.TrimSpace(r.Header.Get("X-Owner-ID")), strings.TrimSpace(r.Header.Get("X-Owner-Username"))
	if id == "" || username == "" {
		writeError(w, http.StatusUnauthorized, "owner identity required")
		return "", "", false
	}
	return id, username, true
}

func decode(w http.ResponseWriter, r *http.Request, target any) bool {
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}
func mustJSON(value any) []byte { bytes, _ := json.Marshal(value); return bytes }
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
func writeMongoError(w http.ResponseWriter, err error, kind string) {
	if mongo.IsDuplicateKeyError(err) {
		writeError(w, http.StatusConflict, fmt.Sprintf("%s name already exists", kind))
		return
	}
	slog.Error("writing Mongo document", "kind", kind, "error", err)
	writeError(w, http.StatusInternalServerError, "failed to save "+kind)
}

func Router(h *Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.Healthz)
	mux.HandleFunc("POST /datafeeds", h.CreateDatafeed)
	mux.HandleFunc("GET /datafeeds", h.ListDatafeeds)
	mux.HandleFunc("GET /datafeeds/{id}", h.GetDatafeed)
	mux.HandleFunc("POST /datafeeds/{id}/upload-url", h.GetUploadURL)
	mux.HandleFunc("POST /endpoints", h.CreateEndpoint)
	mux.HandleFunc("GET /endpoints", h.ListEndpoints)
	mux.HandleFunc("GET /endpoints/{name}", h.GetEndpoint)
	return mux
}
