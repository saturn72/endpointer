// Package converter converts a CSV byte stream into a JSON array of objects.
package converter

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
)

// Convert reads a CSV from r and returns a JSON-encoded byte slice representing
// an array of objects (first row = header/keys, each subsequent row = one object).
//
// A CSV with only a header row produces a valid empty JSON array ([]). This is
// intentional: the UI already validates that uploads have data rows before
// accepting them, but this service may receive files from other sources in
// the future, and an empty array is a well-defined result rather than an error.
//
// Returns an error if the CSV cannot be parsed or has no header columns.
func Convert(r io.Reader) ([]byte, error) {
	cr := csv.NewReader(r)

	headers, err := cr.Read()
	if err == io.EOF {
		return nil, fmt.Errorf("csv has no data")
	}
	if err != nil {
		return nil, fmt.Errorf("reading csv header: %w", err)
	}
	if len(headers) == 0 {
		return nil, fmt.Errorf("csv header row has no columns")
	}

	rows := make([]map[string]string, 0)
	for {
		record, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("reading csv row: %w", err)
		}
		obj := make(map[string]string, len(headers))
		for i, h := range headers {
			if i < len(record) {
				obj[h] = record[i]
			} else {
				obj[h] = ""
			}
		}
		rows = append(rows, obj)
	}

	b, err := json.Marshal(rows)
	if err != nil {
		return nil, fmt.Errorf("marshaling json: %w", err)
	}
	return b, nil
}
