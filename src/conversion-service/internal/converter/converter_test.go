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

func TestConvertXML(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		wantJSON string
		wantErr  bool
	}{
		{
			name: "valid XML with multiple records produces array of objects",
			input: `<?xml version="1.0" encoding="UTF-8"?>
<feed>
  <record><id>1</id><name>Alice</name><price>9.99</price></record>
  <record><id>2</id><name>Bob</name><price>19.99</price></record>
</feed>`,
			wantJSON: `[{"id":"1","name":"Alice","price":"9.99"},{"id":"2","name":"Bob","price":"19.99"}]`,
		},
		{
			name:     "XML root with no child records produces empty array",
			input:    `<feed></feed>`,
			wantJSON: `[]`,
		},
		{
			name:     "XML with single record produces single-element array",
			input:    `<feed><item><sku>ABC</sku><qty>5</qty></item></feed>`,
			wantJSON: `[{"qty":"5","sku":"ABC"}]`,
		},
		{
			name:    "malformed XML returns error",
			input:   `<feed><record><id>1</id></record`,
			wantErr: true,
		},
		{
			name:    "empty input returns error",
			input:   "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := converter.ConvertXML(strings.NewReader(tt.input))
			if tt.wantErr {
				if err == nil {
					t.Fatalf("ConvertXML() expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("ConvertXML() unexpected error: %v", err)
			}
			if string(got) != tt.wantJSON {
				t.Errorf("ConvertXML() = %q, want %q", got, tt.wantJSON)
			}
		})
	}
}
