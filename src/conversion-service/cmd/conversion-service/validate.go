package main

import (
	"fmt"
	"strings"
)

const maxRawBytes = 10 * 1024 * 1024

// supportedExts are the formats this service can actually convert today.
var supportedExts = map[string]bool{".csv": true, ".xml": true}

// validateRaw re-checks a raw upload so a bypassed or stale manager check cannot reach the converter.
func validateRaw(filename string, size int64) error {
	if size < 1 || size > maxRawBytes {
		return fmt.Errorf("file size %d outside 1..%d bytes", size, maxRawBytes)
	}
	ext := ""
	if i := strings.LastIndex(filename, "."); i >= 0 {
		ext = strings.ToLower(filename[i:])
	}
	if !supportedExts[ext] {
		return fmt.Errorf("unsupported file format %q", ext)
	}
	return nil
}
