package manager

import (
	"encoding/json"
	"testing"
)

func TestNonNilSerialisesEmptyListAsArray(t *testing.T) {
	var docs []datafeedDoc
	b, err := json.Marshal(nonNil(docs))
	if err != nil || string(b) != "[]" {
		t.Fatalf("got %s, %v; want []", b, err)
	}
}
