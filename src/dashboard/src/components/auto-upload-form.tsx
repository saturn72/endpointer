'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUploadUrl, finalizeUpload, type UploadResult, type FileFormat } from '@/actions/endpoints';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Loader2, ServerCrash, Upload } from 'lucide-react';

interface AutoUploadFormProps {
    endpointName: string;
}

export function AutoUploadForm({ endpointName }: AutoUploadFormProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);
    const router = useRouter();
    // Tracks pending refresh timers so a new upload can cancel in-flight polls.
    const refreshTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const clearRefreshTimers = () => {
        refreshTimers.current.forEach(clearTimeout);
        refreshTimers.current = [];
    };

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setResult(null);
        setUploading(true);
        clearRefreshTimers();

        // ── Step 1: get presigned POST URL from the server ────────────────────
        const urlResult = await getUploadUrl(endpointName, file.name);
        if (urlResult.status !== 'success') {
            setResult(urlResult);
            setUploading(false);
            return;
        }

        const { url, fields, key, format } = urlResult;

        // ── Step 2: POST file directly to S3 (browser → S3, no server relay) ─
        // fetch is used instead of XHR; upload progress events are not available
        // via the Fetch API, so the drop zone shows an indeterminate spinner.
        const fd = new FormData();
        // Presigned POST fields must come before the file content.
        for (const [k, v] of Object.entries(fields)) fd.append(k, v);
        fd.append('file', file); // actual content — must be last

        let s3Error: string | null = null;
        try {
            const response = await fetch(url, { method: 'POST', body: fd });
            if (!response.ok) {
                // Non-2xx from S3 means the presigned POST policy was violated
                // (e.g. file too large, or the URL expired).
                s3Error = `Upload rejected (HTTP ${response.status}). The file may be too large or the upload link expired. Please try again.`;
            }
        } catch {
            s3Error = 'Upload failed due to a network error. Please check your connection and try again.';
        }

        if (s3Error) {
            setResult({ status: 'infra-error', message: s3Error });
            setUploading(false);
            return;
        }

        // ── Step 3: finalize — validate the uploaded file server-side ─────────
        const finalResult = await finalizeUpload(endpointName, key, format as FileFormat);
        setResult(finalResult);
        setUploading(false);

        if (finalResult.status === 'success') {
            if (fileInputRef.current) fileInputRef.current.value = '';
            // Refresh immediately so the page reflects the accepted upload.
            // The conversion+versioning pipeline is async so we also poll at
            // short intervals to pick up the new version entry once it lands.
            router.refresh();
            refreshTimers.current = [
                setTimeout(() => router.refresh(), 3000),
                setTimeout(() => router.refresh(), 8000),
                setTimeout(() => router.refresh(), 15000),
            ];
        }
    }

    return (
        <div className="space-y-4">
            {/* Drop zone / trigger */}
            <div
                role="button"
                tabIndex={0}
                aria-label="Select file to upload"
                onClick={() => !uploading && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !uploading)
                        fileInputRef.current?.click();
                }}
                className={[
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                    uploading
                        ? 'cursor-not-allowed opacity-60 border-border'
                        : 'cursor-pointer border-border hover:border-primary/60 hover:bg-primary/5',
                ].join(' ')}
            >
                <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <p className="text-sm font-medium text-foreground">
                        {uploading ? 'Uploading…' : 'Drag and drop file here'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        CSV, XLSX, XLS, XML, JSON, or INI files, up to 10&nbsp;MB.
                    </p>
                </div>
                {!uploading && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-1 pointer-events-none"
                        tabIndex={-1}
                    >
                        Select File
                    </Button>
                )}
                {uploading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            </div>

            {/* Hidden file input — opened programmatically by the drop zone above */}
            <Input
                ref={fileInputRef}
                id="file"
                type="file"
                name="file"
                accept=".csv,.xlsx,.xls,.xml,.json,.ini"
                onChange={handleFileChange}
                disabled={uploading}
                className="sr-only"
                aria-hidden="true"
            />

            {result?.status === 'success' && (
                <Alert className="border-primary/30 bg-primary/5 text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <AlertDescription>
                        File uploaded successfully and stored in the data lake.
                    </AlertDescription>
                </Alert>
            )}

            {result?.status === 'error' && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{result.message}</AlertDescription>
                </Alert>
            )}

            {result?.status === 'infra-error' && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600">
                    <ServerCrash className="h-4 w-4" />
                    <AlertDescription>{result.message}</AlertDescription>
                </Alert>
            )}
        </div>
    );
}
