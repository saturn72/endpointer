import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

export default async function globalSetup() {
    const bucket = process.env.S3_RAW_BUCKET ?? 'raw';

    const s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
        region: process.env.S3_REGION ?? 'us-east-1',
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'test-key',
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'test-secret',
        },
        forcePathStyle: true,
    });

    try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`[setup] Created S3 bucket: ${bucket}`);
    }
}
