package manager

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireServiceToken(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	tests := []struct {
		name, token, header string
		want                int
	}{
		{"valid", "s3cret", "Bearer s3cret", http.StatusNoContent},
		{"missing header", "s3cret", "", http.StatusUnauthorized},
		{"wrong token", "s3cret", "Bearer other", http.StatusUnauthorized},
		{"no scheme", "s3cret", "s3cret", http.StatusUnauthorized},
		{"empty configured token denies all", "", "Bearer ", http.StatusUnauthorized},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/datafeeds", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			rec := httptest.NewRecorder()
			RequireServiceToken(tt.token, next).ServeHTTP(rec, req)
			if rec.Code != tt.want {
				t.Fatalf("status = %d; want %d", rec.Code, tt.want)
			}
		})
	}
}

func TestRouterRequiresTokenForResources(t *testing.T) {
	h := &Handler{ServiceToken: "s3cret"}
	rec := httptest.NewRecorder()
	Router(h).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/datafeeds", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("datafeeds without token = %d; want 401", rec.Code)
	}
}
