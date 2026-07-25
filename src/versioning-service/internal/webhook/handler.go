// Package webhook implements the SeaweedFS filer notification webhook receiver
// for the versioning-service.
//
// The payload format is identical to the one used by conversion-service.
// This package is an intentional small duplication — two independent services
// should not share internal packages.
package webhook

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
)

// Payload is the JSON body that SeaweedFS (or the conversion-service forwarder)
// POSTs for each filer event.
//
// Fields with empty values are omitted from the JSON. Use pointer types for
// optional nested objects and check for nil.
type Payload struct {
	// Key is the full filer path, e.g. "/buckets/converted-feeds/ep/uuid/data.json".
	Key       string  `json:"key"`
	EventType string  `json:"event_type"`
	Message   Message `json:"message"`
}

// Message carries the before/after entry state for the event.
type Message struct {
	OldEntry *Entry `json:"old_entry,omitempty"`
	NewEntry *Entry `json:"new_entry,omitempty"`
}

// Entry is the minimal subset of a filer entry we need to classify events.
type Entry struct {
	Name        string `json:"name"`
	IsDirectory bool   `json:"is_directory"`
}

// Handler returns an http.Handler that decodes webhook payloads and calls
// fn(s3Key) for each new non-directory file created under convertedBucket.
//
// The S3 key is obtained by stripping the "/buckets/{convertedBucket}/"
// prefix from the event's "key" field.
func Handler(convertedBucket string, fn func(s3Key string)) http.Handler {
	prefix := "/buckets/" + convertedBucket + "/"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var p Payload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			slog.Error("decoding webhook payload", "error", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		if p.EventType != "create" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if p.Message.NewEntry == nil || p.Message.NewEntry.IsDirectory {
			w.WriteHeader(http.StatusOK)
			return
		}
		if !strings.HasPrefix(p.Key, prefix) {
			w.WriteHeader(http.StatusOK)
			return
		}

		s3Key := strings.TrimPrefix(p.Key, prefix)
		slog.Info("webhook received converted file", "key", s3Key)
		fn(s3Key)
		w.WriteHeader(http.StatusOK)
	})
}
