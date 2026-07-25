// Package blobclient provides a thin S3 client factory configured for the
// SeaweedFS S3 gateway. It wraps aws-sdk-go-v2 directly with no additional
// abstraction layer, consistent with how the Next.js dashboard talks to S3.
package blobclient

import (
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Config holds the S3 connection parameters loaded from env vars.
type Config struct {
	Endpoint        string
	Region          string
	AccessKeyID     string
	SecretAccessKey string
}

// New creates an *s3.Client configured for the SeaweedFS S3 gateway.
// Path-style addressing (UsePathStyle=true) is required by SeaweedFS.
func New(cfg Config) *s3.Client {
	awsCfg := aws.Config{
		Region: cfg.Region,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.AccessKeyID, cfg.SecretAccessKey, "",
		),
		BaseEndpoint: aws.String(cfg.Endpoint),
	}
	return s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})
}
