# Firebase Storage Backup Setup

SeaweedFS live data stays on the `local-path` PVCs. Firebase Storage is backed by Google Cloud Storage and is suitable as the off-node backup target, not as a mounted live volume.

## One-Time Google Cloud Setup

1. Open the Firebase project in Google Cloud Console and identify its storage bucket, usually `<project-id>.firebasestorage.app` or `<project-id>.appspot.com`.
2. Create a dedicated service account, for example `seaweedfs-backup`.
3. Grant it bucket-scoped `Storage Object Admin` permission on the backup bucket only. Do not grant project-wide Owner or Editor permissions.
4. Create a JSON key for that account and retain it only in your password manager and the server's Kubernetes secret.
5. Enable object versioning and a lifecycle rule in the bucket. Retain at least 30 days of backup versions.

## Kubernetes Secret

Create the credential directly on the server. Do not add the service-account JSON to this repository or paste it into chat.

```sh
k3s kubectl -n saturn72 create secret generic seaweedfs-backup-gcs \
  --from-file=service-account.json=/secure/path/to/service-account.json
```

Once the bucket name and retention schedule are selected, add a scheduled backup Job that mounts this secret and writes encrypted backups to the bucket.