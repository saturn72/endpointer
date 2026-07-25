// Package blobclient provides a thin SeaweedFS/S3 client factory.
//
// Duplicated intentionally from conversion-service's blobclient — two
// independent services should not share internal packages at this size.
package blobclient

import (
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Config holds the S3 / SeaweedFS connection parameters.
type Config struct {
	Endpoint        string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
}

// New returns a pre-configured S3 client pointed at the SeaweedFS S3 gateway.
// UsePathStyle is enabled because SeaweedFS requires it.
func New(cfg Config) *s3.Client {
	return s3.New(s3.Options{
		BaseEndpoint: aws.String(cfg.Endpoint),
		Region:       cfg.Region,
		Credentials:  credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		UsePathStyle: true,
	})
}
