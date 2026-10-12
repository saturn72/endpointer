# datafeed-manager-service

This service owns phase 1 datafeed and endpoint definitions in MongoDB. All
definition requests require the dashboard's `X-Owner-ID` and
`X-Owner-Username` headers; records are always filtered by the owner ID.
Every request except `/healthz` must also carry `Authorization: Bearer $MANAGER_SERVICE_TOKEN`; the service refuses to start without that variable.

It supports the `static-file` adapter and issues five-minute presigned PUT
URLs for objects under `raw-uploads/<owner>/<datafeed>/<uuid>`. The original
filename is signed as object metadata, so the client cannot choose or reuse an
object key. File size, extension, and content type are checked before signing.

Upload tracking, orphan cleanup, dedicated S3 credentials, and conversion
revalidation remain in issue #17. Public reads remain independent in
`datafeed-service`.