// Package webhook implements the SeaweedFS filer notification webhook receiver.
//
// SeaweedFS pushes HTTP POST requests to the configured endpoint whenever a
// filer event occurs. This package decodes those payloads and delegates
// new-file creation events to a caller-supplied handler function.
package webhook

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// Payload is the JSON body that SeaweedFS POSTs for each filer event.
//
// From the SeaweedFS docs: "fields with empty values are omitted from the JSON
// — a create event has no old_entry key at all". Use pointer types and check
// for nil rather than expecting explicit nulls.
type Payload struct {
	// Key is the full filer path, e.g. "/buckets/raw-uploads/ep/uuid/file.csv".
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

// Handler returns an http.Handler that decodes SeaweedFS webhook payloads and
// calls fn for each new non-directory file creation event. The full Payload is
// passed so the caller can route by Key (which bucket path) without this
// package needing to know the set of watched buckets.
//
// Errors decoding the payload are logged and receive a 400; all other cases
// (wrong method, non-create events, directory events) receive a 200 so
// SeaweedFS does not retry them unnecessarily.
func Handler(fn func(p Payload)) http.Handler {
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

		// Filter out non-create events and directory entries before delegating.
		if p.EventType != "create" {
			w.WriteHeader(http.StatusOK)
			return
		}
		if p.Message.NewEntry == nil || p.Message.NewEntry.IsDirectory {
			w.WriteHeader(http.StatusOK)
			return
		}

		fn(p)
		w.WriteHeader(http.StatusOK)
	})
}
