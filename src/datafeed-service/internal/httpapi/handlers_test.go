package httpapi_test

import (
	"testing"

	"github.com/endpointer-platform/datafeed-service/internal/httpapi"
)

func TestComputePagination(t *testing.T) {
	tests := []struct {
		name     string
		offset   int
		limit    int
		total    int
		wantTake int
	}{
		{"first slice of three", 0, 10, 25, 10},
		{"middle slice", 10, 10, 25, 10},
		{"last partial slice", 20, 10, 25, 5},
		{"offset beyond end returns zero take", 30, 10, 25, 0},
		{"empty content returns zero", 0, 10, 0, 0},
		{"exact single page", 0, 5, 5, 5},
		{"single item", 0, 100, 1, 1},
		{"first of two equal pages", 0, 10, 20, 10},
		{"second of two equal pages", 10, 10, 20, 10},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			take := httpapi.ComputePagination(tt.offset, tt.limit, tt.total)
			if take != tt.wantTake {
				t.Errorf("ComputePagination(%d, %d, %d) = %d; want %d",
					tt.offset, tt.limit, tt.total, take, tt.wantTake)
			}
		})
	}
}

func TestFindByID(t *testing.T) {
	content := []interface{}{
		map[string]interface{}{"id": "1", "name": "Alice"},
		map[string]interface{}{"id": "2", "name": "Bob"},
		map[string]interface{}{"id": "3", "name": "Charlie"},
	}

	tests := []struct {
		name      string
		content   []interface{}
		idField   string
		id        string
		wantFound bool
		wantName  string // non-empty when wantFound=true, for verifying the right record
	}{
		{"finds first record", content, "id", "1", true, "Alice"},
		{"finds middle record", content, "id", "2", true, "Bob"},
		{"finds last record", content, "id", "3", true, "Charlie"},
		{"missing id returns not found", content, "id", "99", false, ""},
		{"wrong field name returns not found", content, "no_such_field", "1", false, ""},
		// Verify that a different set of content (simulating a different endpoint's
		// records) has no effect — FindByID only scans the provided content slice.
		{"empty content returns not found", []interface{}{}, "id", "1", false, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			record, found := httpapi.FindByID(tt.content, tt.idField, tt.id)
			if found != tt.wantFound {
				t.Fatalf("FindByID idField=%q id=%q: found=%v; want %v",
					tt.idField, tt.id, found, tt.wantFound)
			}
			if found && tt.wantName != "" {
				m, ok := record.(map[string]interface{})
				if !ok {
					t.Fatalf("returned record is not a map")
				}
				if got := m["name"]; got != tt.wantName {
					t.Errorf("record name = %v; want %v", got, tt.wantName)
				}
			}
		})
	}
}
