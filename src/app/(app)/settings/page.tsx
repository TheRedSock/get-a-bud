import { Palette, ShieldCheck, Users } from "lucide-react";

import { EnableBankingCard } from "@/components/settings/enable-banking-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveHousehold } from "@/lib/finance/household";
import { getHouseholdConnections } from "@/lib/ingestion/enable-banking/queries";

type SettingsPageProps = {
  searchParams?: Promise<{
    enable_banking?: string | string[];
    sync_run?: string | string[];
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps = {}) {
  const resolvedSearchParams = await searchParams;
  const enableBankingResult = Array.isArray(resolvedSearchParams?.enable_banking)
    ? resolvedSearchParams?.enable_banking[0]
    : resolvedSearchParams?.enable_banking;
  const syncRunId = Array.isArray(resolvedSearchParams?.sync_run)
    ? resolvedSearchParams?.sync_run[0]
    : resolvedSearchParams?.sync_run;

  const household = await getActiveHousehold();
  const connections = await getHouseholdConnections(household.householdId);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <EnableBankingCard
        callbackResult={enableBankingResult}
        initialConnections={connections}
        initialSyncRunId={syncRunId}
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {["Aurora", "Mint", "Ember"].map((theme) => (
              <button
                key={theme}
                disabled
                className="rounded-3xl border bg-background/40 p-5 text-left opacity-60"
              >
                <Palette className="mb-4 size-5 text-primary" />
                <p className="font-semibold">{theme}</p>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Household</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-start gap-3 rounded-3xl bg-secondary/60 p-5">
              <Users className="mt-1 size-5 text-primary" />
              <div>
                <p className="font-semibold">Shared budgeting is modeled</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Roles, account visibility and integration permissions are ready for a
                  family workflow.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-3xl bg-secondary/60 p-5">
              <ShieldCheck className="mt-1 size-5 text-primary" />
              <div>
                <p className="font-semibold">Security posture</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  CSP, frame blocking, referrer policy and permissions policy are
                  configured in Next.js.
                </p>
              </div>
            </div>
            <Badge className="w-fit">More permissions deferred</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
