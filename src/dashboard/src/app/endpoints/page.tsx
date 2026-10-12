import { clientPromise, dbName } from '@/lib/mongodb';
import { Document } from 'mongodb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { NewEndpointSheet } from '@/components/new-endpoint-sheet';
import { ErrorBanner } from '@/components/error-banner';
import { requireUser } from '@/lib/session';
import { managerListDatafeeds, managerListEndpoints, type ManagerDatafeed, type ManagerEndpoint } from '@/lib/datafeed-manager';

interface VersionDoc extends Document {
    datafeed_id: string;
    major: number;
    minor: number;
}

type SearchParams = Promise<{ error?: string; infraError?: string }>;

export default async function EndpointsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const { error, infraError } = await searchParams;
    await requireUser();

    let endpoints: ManagerEndpoint[] = [];
    let versionMap: Record<string, string> = {};
    let idFieldMap: Record<string, string | null> = {};
    let dbError = false;

    try {
        const client = await clientPromise;
        const db = client.db(dbName);
        endpoints = await managerListEndpoints();

        const latestVersions = await db
            .collection<VersionDoc>('versions')
            .aggregate<{ _id: string; major: number; minor: number }>([
                { $match: { datafeed_id: { $in: endpoints.map((e) => e.datafeed_id) } } },
                { $sort: { major: -1, minor: -1 } },
                {
                    $group: {
                        _id: '$datafeed_id',
                        major: { $first: '$major' },
                        minor: { $first: '$minor' },
                    },
                },
            ])
            .toArray();

        const datafeeds = await managerListDatafeeds();
        idFieldMap = Object.fromEntries(datafeeds.map((d: ManagerDatafeed) => [d._id, d.adapter_config.id_field]));

        versionMap = Object.fromEntries(
            latestVersions.map((v) => [v._id, `v${v.major}.${v.minor}`]),
        );
    } catch (err) {
        console.error('EndpointsPage: database error', err);
        dbError = true;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Endpoints</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage data ingestion endpoints and configurations.
                    </p>
                </div>
                <NewEndpointSheet />
            </div>

            {error && <ErrorBanner type="validation" message={error} />}
            {(infraError || dbError) && (
                <ErrorBanner
                    type="infra"
                    message="A server error occurred. Please try again."
                />
            )}

            {endpoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                        <FolderOpen className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">No endpoints yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-5">
                        Create an endpoint to start ingesting and mapping your data feeds into the
                        system.
                    </p>
                    <NewEndpointSheet />
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {endpoints.map((ep) => {
                        const version = versionMap[ep.datafeed_id];
                        const idField = idFieldMap[ep.datafeed_id];
                        const isActive = Boolean(version);
                        return (
                            <Link
                                href={`/endpoints/${ep.name}`}
                                key={ep._id}
                                className="group"
                            >
                                <Card className="h-full border border-border shadow-sm hover:shadow-md transition-shadow">
                                    <CardContent className="p-5 flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                <Database className="h-4 w-4 text-primary" />
                                            </div>
                                            <Badge
                                                variant="secondary"
                                                className={
                                                    isActive
                                                        ? 'text-xs bg-primary/10 text-primary border-0'
                                                        : 'text-xs bg-muted text-muted-foreground border-0'
                                                }
                                            >
                                                {isActive ? 'Active' : 'Draft'}
                                            </Badge>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                                                {ep.name}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                {idField ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        ID: {idField}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        No ID field
                                                    </span>
                                                )}
                                                {version && (
                                                    <Badge className="text-xs bg-primary text-primary-foreground hover:bg-primary px-1.5 py-0">
                                                        {version}
                                                    </Badge>
                                                )}
                                                {!version && (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        No versions yet
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-auto">
                                            Created:{' '}
                                            {new Date(ep.created_at).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                            })}
                                        </p>
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
