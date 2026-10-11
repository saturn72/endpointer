import { notFound } from 'next/navigation';
import Link from 'next/link';
import { clientPromise, dbName } from '@/lib/mongodb';
import { Document } from 'mongodb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, CloudUpload, FileText, Key, Eye, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { AutoUploadForm } from '@/components/auto-upload-form';
import { requireUser } from '@/lib/session';
import { findOwnedDatafeed, backfillOwnerUsername } from '@/lib/datafeeds';

interface EndpointDoc extends Document {
    name: string;
    datafeed_id: string;
    created_at: Date;
}

interface VersionDoc extends Document {
    datafeed_id: string;
    major: number;
    minor: number;
    warnings: string[];
    created_at: Date;
    record_count: number | null;
    filename: string | null;
}

type Params = Promise<{ name: string }>;
type SearchParams = Promise<Record<string, string>>;

const PAGE_SIZE = 10;

export default async function EndpointDetailPage({
    params,
    searchParams,
}: {
    params: Params;
    searchParams: SearchParams;
}) {
    const { name } = await params;
    const { id: ownerId, username } = await requireUser();
    const sp = await searchParams;
    const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
    const skip = (page - 1) * PAGE_SIZE;

    const datafeedBase =
        (process.env.DATAFEED_SERVICE_URL ?? 'http://localhost:8082').replace(/\/$/, '');

    const client = await clientPromise;
    const db = client.db(dbName);

    await backfillOwnerUsername(db, ownerId, username);
    const endpoint = await db.collection<EndpointDoc>('endpoints').findOne({ owner_id: ownerId, name });
    if (!endpoint) notFound();
    const datafeed = await findOwnedDatafeed(db, ownerId, endpoint.datafeed_id);
    const idField = datafeed?.adapter_config.id_field ?? null;

    const [recentVersions, totalCount] = await Promise.all([
        db
            .collection<VersionDoc>('versions')
            .aggregate<VersionDoc>([
                { $match: { datafeed_id: endpoint.datafeed_id } },
                { $sort: { created_at: -1 } },
                { $skip: skip },
                { $limit: PAGE_SIZE },
                {
                    $project: {
                        major: 1,
                        minor: 1,
                        warnings: 1,
                        created_at: 1,
                        filename: 1,
                        record_count: {
                            $cond: [
                                { $isArray: '$content' },
                                { $size: '$content' },
                                null,
                            ],
                        },
                    },
                },
            ])
            .toArray(),
        db.collection<VersionDoc>('versions').countDocuments({ datafeed_id: endpoint.datafeed_id }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const latestVersion =
        page === 1 && recentVersions.length > 0
            ? `v${recentVersions[0].major}.${recentVersions[0].minor}`
            : null;

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm text-muted-foreground">
                <Link href="/endpoints" className="hover:text-foreground transition-colors">
                    Endpoints
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span className="text-foreground font-medium">{endpoint.name}</span>
            </nav>

            {/* Page header */}
            <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <CloudUpload className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-2xl font-bold text-foreground">{endpoint.name}</h1>
                        {latestVersion && (
                            <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                                {latestVersion}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        {idField ? (
                            <span className="flex items-center gap-1">
                                <Key className="h-3.5 w-3.5" />
                                ID Field: {idField}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 italic">
                                <Key className="h-3.5 w-3.5" />
                                No ID field
                            </span>
                        )}
                        <span>
                            Created{' '}
                            {new Date(endpoint.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                            })}
                        </span>
                    </div>
                </div>
            </div>

            {/* Recent versions table */}
            <Card className="border border-border shadow-sm">
                <CardHeader className="p-6 pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold">Recent Uploads</CardTitle>
                        {totalCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                                {totalCount} total
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    {recentVersions.length === 0 ? (
                        <p className="px-6 pb-6 text-sm text-muted-foreground">No uploads yet.</p>
                    ) : (
                        <>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left text-xs font-medium text-muted-foreground px-6 pb-3">
                                            Filename
                                        </th>
                                        <th className="text-left text-xs font-medium text-muted-foreground px-6 pb-3">
                                            Date
                                        </th>
                                        <th className="text-right text-xs font-medium text-muted-foreground px-6 pb-3">
                                            Records
                                        </th>
                                        <th className="text-left text-xs font-medium text-muted-foreground px-6 pb-3">
                                            Public
                                        </th>
                                        <th className="text-left text-xs font-medium text-muted-foreground px-6 pb-3">
                                            Status
                                        </th>
                                        <th className="text-left text-xs font-medium text-muted-foreground px-6 pb-3">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentVersions.map((v) => {
                                        const hasWarnings = v.warnings && v.warnings.length > 0;
                                        return (
                                            <tr
                                                key={`${v.major}.${v.minor}`}
                                                className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors"
                                            >
                                                <td className="px-6 py-3 font-medium text-foreground">
                                                    <Link href={`/endpoints/${name}/versions/${v.major}-${v.minor}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                                                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        {v.filename ?? `v${v.major}.${v.minor}`}
                                                    </Link>
                                                </td>
                                                <td className="px-6 py-3 text-muted-foreground">
                                                    {v.created_at ? new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </td>
                                                <td className="px-6 py-3 text-right text-muted-foreground tabular-nums">
                                                    {v.record_count != null ? v.record_count.toLocaleString() : '—'}
                                                </td>
                                                <td className="px-6 py-3 text-muted-foreground">—</td>
                                                <td className="px-6 py-3">
                                                    {hasWarnings ? (
                                                        <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-0">Warning</Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">Success</Badge>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <a href={`${datafeedBase}/${username}/${name}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                                                        <Eye className="h-3 w-3" />View Data
                                                    </a>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                                    <span className="text-xs text-muted-foreground">
                                        Page {page} of {totalPages}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/endpoints/${name}?page=${page - 1}`}
                                            aria-disabled={page <= 1}
                                            tabIndex={page <= 1 ? -1 : 0}
                                            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium ${page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-accent'}`}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Previous
                                        </Link>
                                        <Link
                                            href={`/endpoints/${name}?page=${page + 1}`}
                                            aria-disabled={page >= totalPages}
                                            tabIndex={page >= totalPages ? -1 : 0}
                                            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium ${page >= totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-accent'}`}
                                        >
                                            Next
                                            <ChevronRightIcon className="h-4 w-4" />
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Upload section */}
            <Card className="border border-border shadow-sm">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <CloudUpload className="h-4 w-4 text-primary" />
                        Upload Datafeed
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                    <AutoUploadForm endpointName={name} />
                </CardContent>
            </Card>
        </div>
    );
}
