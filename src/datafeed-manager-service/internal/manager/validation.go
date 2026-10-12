package manager

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	MaxNameLength        = 100
	MaxDescriptionLength = 500
	MaxUploadBytes       = 10 * 1024 * 1024
)

var safeNamePattern = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

var formatContentTypes = map[string]map[string]bool{
	"csv":  {"text/csv": true, "application/csv": true, "application/octet-stream": true},
	"json": {"application/json": true, "text/json": true, "application/octet-stream": true},
	"xml":  {"application/xml": true, "text/xml": true, "application/octet-stream": true},
	"ini":  {"text/plain": true, "application/octet-stream": true},
	"xls":  {"application/vnd.ms-excel": true, "application/octet-stream": true},
	"xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true, "application/octet-stream": true},
}

func ValidateName(value, label string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if len(value) > MaxNameLength {
		return fmt.Errorf("%s must be %d characters or fewer", label, MaxNameLength)
	}
	if !safeNamePattern.MatchString(value) {
		return fmt.Errorf("%s must contain only letters, numbers, dashes, and underscores", label)
	}
	return nil
}

func ValidateIDField(value string) error {
	if value != "" && !safeNamePattern.MatchString(value) {
		return fmt.Errorf("ID field must contain only letters, numbers, dashes, and underscores")
	}
	return nil
}

func UploadFormat(filename, contentType string, size int64) (string, error) {
	if filename == "" || len(filename) > 255 || strings.ContainsAny(filename, `/\\\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f`) {
		return "", fmt.Errorf("invalid file name")
	}
	if size < 1 || size > MaxUploadBytes {
		return "", fmt.Errorf("file size must be between 1 byte and %d MB", MaxUploadBytes/(1024*1024))
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(filename)), ".")
	allowed, ok := formatContentTypes[ext]
	if !ok {
		return "", fmt.Errorf("unsupported file format")
	}
	if contentType != "" && !allowed[contentType] {
		return "", fmt.Errorf("content type %q is not valid for .%s files", contentType, ext)
	}
	return ext, nil
}
