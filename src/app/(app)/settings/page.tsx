import { Palette, ShieldCheck, Users } from "lucide-react";

import { EnableBankingCard } from "@/components/settings/enable-banking-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <EnableBankingCard />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {["Aurora", "Mint", "Ember"].map((theme) => (
              <button
                key={theme}
                className="rounded-3xl border bg-background/40 p-5 text-left transition-transform hover:-translate-y-1"
              >
                <Palette className="mb-4 size-5 text-primary" />
                <p className="font-semibold">{theme}</p>
                <p className="text-sm text-muted-foreground">Chart-aware palette</p>
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
