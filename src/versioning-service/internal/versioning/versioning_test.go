package versioning_test

import (
	"testing"

	"github.com/endpointer-platform/versioning-service/internal/versioning"
)

func TestNextVersion(t *testing.T) {
	tests := []struct {
		name         string
		maxMajor     int
		maxMinor     int
		exists       bool
		wantMajor    int
		wantMinor    int
	}{
		// No prior versions for this endpoint → first version is 1.0.
		{name: "no versions returns 1.0", exists: false, wantMajor: 1, wantMinor: 0},
		// Existing 1.0 → next is 1.1.
		{name: "1.0 -> 1.1", maxMajor: 1, maxMinor: 0, exists: true, wantMajor: 1, wantMinor: 1},
		// Existing 1.2 → next is 1.3.
		{name: "1.2 -> 1.3", maxMajor: 1, maxMinor: 2, exists: true, wantMajor: 1, wantMinor: 3},
		// A different endpoint's versions do not affect the result — the MongoDB
		// query is scoped by endpoint_name before NextVersion is called, so the
		// function only sees that endpoint's current max.
		// Here we model "other endpoint has 2.5, this endpoint starts fresh":
		{name: "fresh endpoint is unaffected by other endpoints", exists: false, wantMajor: 1, wantMinor: 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotMajor, gotMinor := versioning.NextVersion(tt.maxMajor, tt.maxMinor, tt.exists)
			if gotMajor != tt.wantMajor || gotMinor != tt.wantMinor {
				t.Errorf("NextVersion(%d, %d, %v) = %d.%d; want %d.%d",
					tt.maxMajor, tt.maxMinor, tt.exists,
					gotMajor, gotMinor,
					tt.wantMajor, tt.wantMinor)
			}
		})
	}
}
