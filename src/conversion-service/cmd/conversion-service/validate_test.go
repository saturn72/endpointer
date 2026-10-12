package main

import "testing"

func TestValidateRaw(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		size     int64
		wantErr  bool
	}{
		{"csv", "feed.csv", 10, false},
		{"upper-case xml", "FEED.XML", 10, false},
		{"empty", "feed.csv", 0, true},
		{"oversized", "feed.csv", maxRawBytes + 1, true},
		{"unsupported", "feed.xlsx", 10, true},
		{"no extension", "feed", 10, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateRaw(tt.filename, tt.size); (err != nil) != tt.wantErr {
				t.Fatalf("validateRaw() error = %v; wantErr %v", err, tt.wantErr)
			}
		})
	}
}
