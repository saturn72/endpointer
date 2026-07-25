package converter_test

import (
	"strings"
	"testing"

	"github.com/endpointer-platform/conversion-service/internal/converter"
)

func TestConvert(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantJSON string
		wantErr  bool
	}{
		{
			name:     "valid CSV produces array of objects",
			input:    "id,name,price\n1,Widget,9.99\n2,Gadget,19.99\n",
			wantJSON: `[{"id":"1","name":"Widget","price":"9.99"},{"id":"2","name":"Gadget","price":"19.99"}]`,
		},
		{
			name:     "header-only CSV produces empty array",
			input:    "id,name,price\n",
			wantJSON: `[]`,
		},
		{
			name:    "empty input returns error",
			input:   "",
			wantErr: true,
		},
		{
			name:    "malformed CSV returns error",
			input:   "id,name\n\"unclosed quote,val\n",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := converter.Convert(strings.NewReader(tt.input))
			if tt.wantErr {
				if err == nil {
					t.Fatalf("Convert() expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("Convert() unexpected error: %v", err)
			}
			if string(got) != tt.wantJSON {
				t.Errorf("Convert() = %q, want %q", got, tt.wantJSON)
			}
		})
	}
}
