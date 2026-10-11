import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ObjectId } from 'mongodb';
import { clientPromise, dbName } from '@/lib/mongodb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight, FileText, Key, Layers } from 'lucide-react';
import { AutoUploadForm } from '@/components/auto-upload-form';
import { ErrorBanner } from '@/components/error-banner';
import { createEndpointFromDatafeed } from '@/actions/datafeeds';
import { requireUser } from '@/lib/session';
import { backfillOwnerUsername, findOwnedDatafeed, type EndpointDoc } from '@/lib/datafeeds';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

const VERSION_LIMIT = 10;

export default async function DatafeedDetailPage({
    params,
    searchParams,
}: {
    params: Params;
    searchParams: SearchParams;
}) {
    const { id } = await params;
    const { error } = await searchParams;
    const { id: ownerId, username } = await requireUser();
    if (!ObjectId.isValid(id)) notFound();

    const db = (await clientPromise).db(dbName);
    const datafeed = await findOwnedDatafeed(db, ownerId, id);
    if (!datafeed) notFound();

    await backfillOwnerUsername(db, ownerId, username);
    const [endpoints, versions] = await Promise.all([
        db.collection<EndpointDoc>('endpoints').find({ owner_id: ownerId, datafeed_id: id }).sort({ created_at: 1 }).toArray(),
        db
            .collection('versions')
            .aggregate<{ major: number; minor: number; filename: string | null; created_at: Date; warnings: string[] }>([
                { $match: { datafeed_id: id } },
                { $sort: { major: -1, minor: -1 } },
                { $limit: VERSION_LIMIT },
                { $project: { major: 1, minor: 1, filename: 1, created_at: 1, warnings: 1 } },
            ])
            .toArray(),
    ]);

    const publicBase = (process.env.DATAFEED_SERVICE_URL ?? 'http://localhost:8082').replace(/\/$/, '');
    const idField = datafeed.adapter_config.id_field;

    return (
        <div className="space-y-6">
            <nav className="flex items-center gap-1 text-sm text-muted-foreground">
                <Link href="/datafeeds" className="hover:text-foreground transition-colors">
                    Datafeeds
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span className="text-foreground font-medium">{datafeed.name}</span>
            </nav>

            {error && <ErrorBanner type="validation" message={error} />}

            <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Layers className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-2xl font-bold text-foreground">{datafeed.name}</h1>
                        {versions[0] && (
                            <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                                v{versions[0].major}.{versions[0].minor}
                            </Badge>
                        )}
                    </div>
                    {datafeed.description && <p className="text-sm text-muted-foreground mt-1">{datafeed.description}</p>}
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Key className="h-3.5 w-3.5" />
                            {idField ? `ID Field: ${idField}` : 'No ID field'}
                        </span>
                        <span>Adapter: static file</span>
                    </div>
                </div>
            </div>

            <Card className="border border-border shadow-sm">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-base font-semibold">Upload a file</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                    <AutoUploadForm datafeedId={id} />
                </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-base font-semibold">Endpoints</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                    {endpoints.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Not served online yet. Connect an endpoint to expose this datafeed.
                        </p>
                    ) : (
                        <ul className="space-y-2 text-sm">
                            {endpoints.map((ep) => (
                                <li key={ep._id.toHexString()} className="flex items-center justify-between gap-3">
                                    <Link href={`/endpoints/${ep.name}`} className="font-medium hover:text-primary">
                                        {ep.name}
                                    </Link>
                                    <code className="text-xs text-muted-foreground truncate">
                                        {publicBase}/{username}/{ep.name}
                                    </code>
                                </li>
                            ))}
                        </ul>
                    )}
                    <form action={createEndpointFromDatafeed} className="flex gap-2 items-center">
                        <input type="hidden" name="datafeed_id" value={id} />
                        <Input
                            name="endpoint_name"
                            required
                            placeholder="new-endpoint-name"
                            pattern="[a-zA-Z0-9_\-]+"
                            title="Letters, numbers, dashes, and underscores only"
                            className="text-sm max-w-xs"
                        />
                        <Button type="submit" size="sm" variant="outline">
                            Connect endpoint
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
                <CardHeader className="p-6 pb-4">
                    <CardTitle className="text-base font-semibold">Versions</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                    {versions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No uploads yet.</p>
                    ) : (
                        <ul className="space-y-2 text-sm">
                            {versions.map((v) => (
                                <li key={`${v.major}.${v.minor}`} className="flex items-center gap-3">
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-medium">
                                        v{v.major}.{v.minor}
                                    </span>
                                    <span className="text-muted-foreground truncate">{v.filename ?? ''}</span>
                                    {v.warnings?.length > 0 && (
                                        <Badge variant="secondary" className="text-xs">
                                            {v.warnings.length} warning{v.warnings.length === 1 ? '' : 's'}
                                        </Badge>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
