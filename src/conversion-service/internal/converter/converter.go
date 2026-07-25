// Package converter converts a CSV byte stream into a JSON array of objects.
package converter

import (
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
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

// ConvertXML reads an XML document from r and returns a JSON-encoded byte
// slice representing an array of objects. The document must follow the
// structural assumption shared with the dashboard XML validator:
//
//	<root>
//	  <record><field1>val</field1><field2>val</field2></record>
//	  <record><field1>val</field1><field2>val</field2></record>
//	</root>
//
// Each depth-2 element is treated as one record; its direct child element
// local names become JSON keys and their text content becomes the values.
// Namespace prefixes are stripped (only the local name is used). Attributes
// on any element are ignored. An empty document or a root with no children
// produces a valid empty JSON array ([]).
//
// Returns an error if the XML is not well-formed.
func ConvertXML(r io.Reader) ([]byte, error) {
	dec := xml.NewDecoder(r)

	rows := make([]map[string]string, 0)

	depth := 0
	sawRoot := false
	var currentRecord map[string]string
	var currentField string

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parsing xml: %w", err)
		}

		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			switch depth {
			case 1:
				sawRoot = true
			case 2:
				// Opening a record element.
				currentRecord = make(map[string]string)
			case 3:
				// Opening a field element; record its local name.
				currentField = localNameXML(t.Name.Local)
			}

		case xml.EndElement:
			switch depth {
			case 2:
				// Closing a record element — append to results.
				if currentRecord != nil {
					rows = append(rows, currentRecord)
					currentRecord = nil
				}
			case 3:
				// Closing a field element.
				currentField = ""
			}
			depth--

		case xml.CharData:
			// Text content inside a field element (depth == 3).
			if depth == 3 && currentRecord != nil && currentField != "" {
				val := strings.TrimSpace(string(t))
				if val != "" {
					currentRecord[currentField] = val
				}
			}
		}
	}

	if !sawRoot {
		return nil, fmt.Errorf("xml: document has no root element")
	}

	b, err := json.Marshal(rows)
	if err != nil {
		return nil, fmt.Errorf("marshaling json: %w", err)
	}
	return b, nil
}

// localNameXML strips a namespace prefix from an XML element name,
// e.g. "ns:record" → "record".
func localNameXML(name string) string {
	if i := strings.LastIndex(name, ":"); i >= 0 {
		return name[i+1:]
	}
	return name
}
