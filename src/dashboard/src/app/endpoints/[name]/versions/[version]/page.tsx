import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clientPromise, dbName } from '@/lib/mongodb';
import { Document } from 'mongodb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ExternalLink, FileText, AlertTriangle, CheckCircle2, Table2 } from 'lucide-react';
import { PublishToggle } from '@/components/publish-toggle';

interface VersionDetailDoc extends Document {
    major: number;
    minor: number;
    warnings: string[];
    created_at: Date;
    record_count: number | null;
    preview: Record<string, unknown>[];
    published: boolean;
}

type Params = Promise<{ name: string; version: string }>;

export default async function UploadDetailPage({ params }: { params: Params }) {
    const { name, version } = await params;

    const parts = version.split('-');
    const major = parseInt(parts[0] ?? '', 10);
    const minor = parseInt(parts[1] ?? '', 10);
    if (isNaN(major) || isNaN(minor)) notFound();

    const datafeedBase =
        (process.env.DATAFEED_SERVICE_URL ?? 'http://localhost:8082').replace(/\/$/, '');

    const client = await clientPromise;
    const db = client.db(dbName);

    const [endpoint, versionDoc] = await Promise.all([
        db.collection('endpoints').findOne({ name }),
        db
            .collection('versions')
            .aggregate<VersionDetailDoc>([
                { $match: { endpoint_name: name, major, minor } },
                {
                    $project: {
                        major: 1,
                        minor: 1,
                        warnings: 1,
                        created_at: 1,                        published: 1,                        record_count: {
                            $cond: [{ $isArray: '$content' }, { $size: '$content' }, null],
                        },
                        preview: { $slice: ['$content', 10] },
                    },
                },
            ])
            .next(),
    ]);

    if (!endpoint || !versionDoc) notFound();

    const versionLabel = `v${major}.${minor}`;
    const hasWarnings = versionDoc.warnings && versionDoc.warnings.length > 0;
    const columns = versionDoc.preview.length > 0 ? Object.keys(versionDoc.preview[0]) : [];

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
                <Link href="/endpoints" className="hover:text-foreground transition-colors">
                    Endpoints
                </Link>
                <ChevronRight className="h-4 w-4 shrink-0" />
                <Link
                    href={`/endpoints/${name}`}
                    className="hover:text-foreground transition-colors"
                >
                    {name}
                </Link>
                <ChevronRight className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">{versionLabel}</span>
            </nav>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-2xl font-bold text-foreground">{versionLabel}</h1>
                            <Badge
                                variant="secondary"
                                className={
                                    hasWarnings
                                        ? 'bg-amber-50 text-amber-700 border-0'
                                        : 'bg-primary/10 text-primary border-0'
                                }
                            >
                                {hasWarnings ? 'Warning' : 'Success'}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <PublishToggle
                        endpointName={name}
                        major={major}
                        minor={minor}
                        initialPublished={versionDoc.published ?? false}
                    />
                    <a
                        href={`${datafeedBase}/${name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Live Feed
                    </a>
                </div>
            </div>

            {/* Upload Details */}
            <Card className="border border-border shadow-sm">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-base font-semibold">Upload Details</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 text-sm">
                        <div>
                            <dt className="text-muted-foreground mb-0.5">Status</dt>
                            <dd>
                                <Badge
                                    variant="secondary"
                                    className={
                                        hasWarnings
                                            ? 'bg-amber-50 text-amber-700 border-0'
                                            : 'bg-primary/10 text-primary border-0'
                                    }
                                >
                                    {hasWarnings ? 'Warning' : 'Success'}
                                </Badge>
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground mb-0.5">Date</dt>
                            <dd className="font-medium text-foreground">
                                {versionDoc.created_at
                                    ? new Date(versionDoc.created_at).toLocaleString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })
                                    : '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground mb-0.5">Records</dt>
                            <dd className="font-medium text-foreground tabular-nums">
                                {versionDoc.record_count != null
                                    ? versionDoc.record_count.toLocaleString()
                                    : '—'}
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>

            {/* Validation Logs */}
            <Card className="border border-border shadow-sm">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        {hasWarnings ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                        Validation Logs
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                    {hasWarnings ? (
                        <ul className="space-y-2">
                            {versionDoc.warnings.map((w, i) => (
                                <li
                                    key={i}
                                    className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2"
                                >
                                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                    {w}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            Validation passed — no issues detected.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Data Preview */}
            {versionDoc.preview.length > 0 && (
                <Card className="border border-border shadow-sm">
                    <CardHeader className="p-6 pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <Table2 className="h-4 w-4 text-primary" />
                                Data Preview
                            </CardTitle>
                            <span className="text-xs text-muted-foreground">
                                Showing 1–{versionDoc.preview.length}
                                {versionDoc.record_count != null &&
                                    ` of ${versionDoc.record_count.toLocaleString()}`}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="px-0 pb-0 overflow-x-auto">
                        <table className="w-full text-sm min-w-max">
                            <thead>
                                <tr className="border-b border-border">{columns.map((col) => (<th key={col} className="text-left text-xs font-medium text-muted-foreground px-4 pb-3 whitespace-nowrap">{col}</th>))}</tr>
                            </thead>
                            <tbody>
                                {versionDoc.preview.map((row, i) => (
                                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">{columns.map((col) => (<td key={col} className="px-4 py-2.5 text-foreground whitespace-nowrap max-w-50 truncate">{String(row[col] ?? '—')}</td>))}</tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
