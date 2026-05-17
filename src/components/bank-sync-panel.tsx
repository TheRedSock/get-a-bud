"use client";

import { Loader2, RefreshCcw, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SyncRunStatus, useBankSyncRuns } from "@/components/bank-sync-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionSummary } from "@/lib/ingestion/enable-banking/queries";

export function BankSyncPanel({
  compact = false,
  initialConnections,
}: {
  compact?: boolean;
  initialConnections: ConnectionSummary[];
}) {
  const [connections, setConnections] = useState<ConnectionSummary[]>(initialConnections);
  const [loading, setLoading] = useState(false);
  const {
    getRunForConnection,
    isConnectionSyncing,
    loadLatestRuns,
    queueSync,
  } = useBankSyncRuns();

  useEffect(() => {
    void loadLatestRuns(initialConnections);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectedConnections = connections.filter(
    (connection) =>
      connection.hasConsentSession &&
      (connection.status === "connected" || connection.status === "rate_limited"),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{compact ? "Bank sync" : "Connected banks"}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking bank connections...
          </div>
        ) : connectedConnections.length ? (
          connectedConnections.map((connection) => (
            <div
              key={connection.id}
              className="rounded-3xl border bg-background/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{connection.displayName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {connection.lastSyncedAt
                      ? `Last synced ${new Date(
                          connection.lastSyncedAt,
                        ).toLocaleString()}`
                      : "Connected, not synced yet"}
                  </p>
                </div>
                <Badge className="w-fit">Connected</Badge>
              </div>
              <Button
                className="mt-4 w-full"
                disabled={isConnectionSyncing(connection.id)}
                type="button"
                onClick={() => void queueSync(connection.id)}
              >
                {isConnectionSyncing(connection.id) ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                Sync accounts and transactions
              </Button>
              <SyncRunStatus run={getRunForConnection(connection.id)} />
            </div>
          ))
        ) : (
          <div className="rounded-3xl border bg-background/40 p-4">
            <p className="font-semibold">No connected bank yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect Enable Banking in settings, then return here to import accounts
              and transactions.
            </p>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/settings/integrations">
                <Settings2 className="size-4" />
                Open integrations
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
