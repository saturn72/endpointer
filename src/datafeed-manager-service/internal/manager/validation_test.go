package manager

import (
	"strings"
	"testing"
)

func TestUploadFormat(t *testing.T) {
	tests := []struct {
		name, filename, contentType string
		size                        int64
		wantFormat, wantErr         string
	}{
		{name: "csv", filename: "feed.csv", contentType: "text/csv", size: 12, wantFormat: "csv"},
		{name: "reject path", filename: "../feed.csv", contentType: "text/csv", size: 12, wantErr: "invalid file name"},
		{name: "reject unsupported", filename: "feed.exe", contentType: "application/octet-stream", size: 12, wantErr: "unsupported file format"},
		{name: "reject empty", filename: "feed.csv", contentType: "text/csv", size: 0, wantErr: "file size"},
		{name: "reject oversized", filename: "feed.csv", contentType: "text/csv", size: MaxUploadBytes + 1, wantErr: "file size"},
		{name: "reject type", filename: "feed.json", contentType: "text/csv", size: 12, wantErr: "content type"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := UploadFormat(tt.filename, tt.contentType, tt.size)
			if tt.wantErr == "" {
				if err != nil || got != tt.wantFormat {
					t.Fatalf("UploadFormat() = %q, %v; want %q", got, err, tt.wantFormat)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("UploadFormat() error = %v; want substring %q", err, tt.wantErr)
			}
		})
	}
}
