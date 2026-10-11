import Link from 'next/link';
import { clientPromise, dbName } from '@/lib/mongodb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, FolderOpen } from 'lucide-react';
import { NewDatafeedSheet } from '@/components/new-datafeed-sheet';
import { ErrorBanner } from '@/components/error-banner';
import { requireUserId } from '@/lib/session';
import type { DatafeedDoc } from '@/lib/datafeeds';

type SearchParams = Promise<{ error?: string; infraError?: string }>;

export default async function DatafeedsPage({ searchParams }: { searchParams: SearchParams }) {
    const { error, infraError } = await searchParams;
    const ownerId = await requireUserId();

    let datafeeds: DatafeedDoc[] = [];
    let latest: Record<string, string> = {};
    let endpointCounts: Record<string, number> = {};
    let dbError = false;

    try {
        const db = (await clientPromise).db(dbName);
        datafeeds = await db
            .collection<DatafeedDoc>('datafeeds')
            .find({ owner_id: ownerId })
            .sort({ created_at: -1 })
            .toArray();
        const ids = datafeeds.map((d) => d._id.toHexString());

        const versions = await db
            .collection('versions')
            .aggregate<{ _id: string; major: number; minor: number }>([
                { $match: { datafeed_id: { $in: ids } } },
                { $sort: { major: -1, minor: -1 } },
                { $group: { _id: '$datafeed_id', major: { $first: '$major' }, minor: { $first: '$minor' } } },
            ])
            .toArray();
        latest = Object.fromEntries(versions.map((v) => [v._id, `v${v.major}.${v.minor}`]));

        const counts = await db
            .collection('endpoints')
            .aggregate<{ _id: string; n: number }>([
                { $match: { owner_id: ownerId, datafeed_id: { $in: ids } } },
                { $group: { _id: '$datafeed_id', n: { $sum: 1 } } },
            ])
            .toArray();
        endpointCounts = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    } catch (err) {
        console.error('DatafeedsPage: database error', err);
        dbError = true;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Datafeeds</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Sources of data. Connect a datafeed to an endpoint to serve it online.
                    </p>
                </div>
                <NewDatafeedSheet />
            </div>

            {error && <ErrorBanner type="validation" message={error} />}
            {(infraError || dbError) && <ErrorBanner type="infra" message="A server error occurred. Please try again." />}

            {datafeeds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                        <FolderOpen className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">No datafeeds yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-5">
                        Create a datafeed from a file, then expose it through an endpoint.
                    </p>
                    <NewDatafeedSheet />
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {datafeeds.map((d) => {
                        const id = d._id.toHexString();
                        const n = endpointCounts[id] ?? 0;
                        return (
                            <Link href={`/datafeeds/${id}`} key={id} className="group">
                                <Card className="h-full border border-border shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="p-5 flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Layers className="h-4 w-4 text-primary" />
                                            </div>
                                            <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground border-0">
                                                Static file
                                            </Badge>
                                        </div>
                                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                                            {d.name}
                                        </p>
                                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                            {latest[id] ? (
                                                <Badge className="text-xs bg-primary text-primary-foreground hover:bg-primary px-1.5 py-0">
                                                    {latest[id]}
                                                </Badge>
                                            ) : (
                                                <span className="italic">No versions yet</span>
                                            )}
                                            <span>
                                                {n} endpoint{n === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
