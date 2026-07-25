import Link from 'next/link';
import { clientPromise, dbName } from '@/lib/mongodb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, ArrowUpRight } from 'lucide-react';
import { ErrorBanner } from '@/components/error-banner';

export default async function DashboardPage() {
  let count = 0;
  let activeCount = 0;
  let dbError = false;

  try {
    const client = await clientPromise;
    const db = client.db(dbName);
    count = await db.collection('endpoints').countDocuments();
    const activeNames: string[] = await db.collection('versions').distinct('endpoint_name');
    activeCount = activeNames.length;
  } catch (err) {
    console.error('DashboardPage: database error', err);
    dbError = true;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {dbError && (
        <ErrorBanner
          type="infra"
          message="Could not load dashboard data. Please try again."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border border-border shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Endpoints</p>
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Database className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-foreground">{count}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
                  <Badge
                    variant="secondary"
                    className="text-xs px-1.5 py-0 bg-primary/10 text-primary border-0"
                  >
                    {activeCount} Active
                  </Badge>
                </div>
              </div>
              <Button
                render={<Link href="/endpoints" />}
                variant="ghost"
                size="sm"
                className="text-primary text-xs h-7 px-2"
                nativeButton={false}
              >
                View Endpoints
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
