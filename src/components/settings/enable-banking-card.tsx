"use client";

import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  SyncRunStatus,
  useBankSyncRuns,
} from "@/components/bank-sync-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConnectionSummary = {
  id: string;
  displayName: string;
  status: string;
  externalApplicationId: string | null;
  hasConsentSession: boolean;
  authorizationId: string | null;
  consentExpiresAt: string | null;
  lastSyncedAt: string | null;
  rateLimitedUntil: string | null;
};

type FormState = {
  displayName: string;
  applicationId: string;
  pemPrivateKey: string;
  aspspName: string;
  aspspCountry: string;
  psuType: "personal" | "business";
  language: string;
  validDays: string;
};

const initialFormState: FormState = {
  displayName: "Enable Banking",
  applicationId: "",
  pemPrivateKey: "",
  aspspName: "",
  aspspCountry: "NO",
  psuType: "personal",
  language: "en",
  validDays: "90",
};

const callbackMessages: Record<
  string,
  { title: string; description: string; tone: "success" | "error" | "info" }
> = {
  connected: {
    title: "Bank connected",
    description:
      "Enable Banking returned a valid session. The initial account and transaction sync has been queued.",
    tone: "success",
  },
  denied: {
    title: "Bank authorization denied",
    description: "The bank did not grant consent for this connection.",
    tone: "error",
  },
  session_failed: {
    title: "Could not create bank session",
    description: "The bank redirect succeeded, but the session exchange failed.",
    tone: "error",
  },
  invalid_state: {
    title: "Bank callback could not be verified",
    description: "The authorization state did not match this household.",
    tone: "error",
  },
  expired: {
    title: "Bank authorization expired",
    description: "Start the connection again to create a fresh authorization state.",
    tone: "error",
  },
};

export function EnableBankingCard({
  callbackResult,
  initialSyncRunId,
}: {
  callbackResult?: string;
  initialSyncRunId?: string;
}) {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const trackedInitialSyncRunId = useRef<string | null>(null);
  const {
    getRunForConnection,
    isConnectionSyncing,
    queueSync,
    trackRunById,
  } = useBankSyncRuns();
  const callbackMessage = useMemo(
    () =>
      callbackResult
        ? callbackMessages[callbackResult] ?? {
            title: "Bank callback received",
            description: `Enable Banking returned status: ${callbackResult}.`,
            tone: "info" as const,
          }
        : null,
    [callbackResult],
  );

  const loadConnections = useCallback(async () => {
    const response = await fetch("/api/integrations/enable-banking", {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const body = (await response.json()) as {
      connections: ConnectionSummary[];
    };
    setConnections(body.connections);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void loadConnections();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [loadConnections]);

  useEffect(() => {
    if (
      !initialSyncRunId ||
      !connections.length ||
      trackedInitialSyncRunId.current === initialSyncRunId
    ) {
      return;
    }

    trackedInitialSyncRunId.current = initialSyncRunId;
    void trackRunById(connections, initialSyncRunId);
  }, [
    connections,
    initialSyncRunId,
    trackRunById,
  ]);

  useEffect(() => {
    if (!callbackMessage) {
      return;
    }

    if (callbackMessage.tone === "success") {
      toast.success(callbackMessage.title, {
        description: callbackMessage.description,
      });
      return;
    }

    if (callbackMessage.tone === "error") {
      toast.error(callbackMessage.title, {
        description: callbackMessage.description,
      });
      return;
    }

    toast.info(callbackMessage.title, {
      description: callbackMessage.description,
    });
  }, [callbackMessage]);

  function updateForm(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const connectionResponse = await fetch("/api/integrations/enable-banking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          applicationId: form.applicationId.trim(),
          pemPrivateKey: form.pemPrivateKey.trim(),
        }),
      });

      if (!connectionResponse.ok) {
        throw new Error("Could not save Enable Banking credentials");
      }

      const { connection } = (await connectionResponse.json()) as {
        connection: { id: string };
      };
      const authResponse = await fetch(
        `/api/integrations/enable-banking/${connection.id}/auth`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aspspName: form.aspspName.trim(),
            aspspCountry: form.aspspCountry.trim(),
            psuType: form.psuType,
            language: form.language.trim(),
            validDays: Number(form.validDays),
          }),
        },
      );

      if (!authResponse.ok) {
        throw new Error("Could not start Enable Banking authorization");
      }

      const { redirectUrl } = (await authResponse.json()) as {
        redirectUrl: string;
      };
      window.location.assign(redirectUrl);
    } catch (error) {
      toast.error("Enable Banking connection failed", {
        description:
          error instanceof Error ? error.message : "Please check the details.",
      });
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enable Banking</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {callbackMessage ? (
          <div
            className={
              callbackMessage.tone === "success"
                ? "rounded-3xl border border-primary/30 bg-primary/10 p-4"
                : "rounded-3xl border bg-background/60 p-4"
            }
          >
            <p className="font-semibold">{callbackMessage.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {callbackMessage.description}
            </p>
          </div>
        ) : null}

        <div className="rounded-3xl bg-secondary/60 p-5">
          <KeyRound className="mb-3 size-5 text-primary" />
          <p className="font-semibold">Secure bank authorization flow</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Save your EB application ID and PEM once, then Get a Bud starts the
            bank consent redirect and stores only the resulting session server-side.
          </p>
        </div>

        <form className="grid gap-4" onSubmit={connect}>
          <div className="grid gap-2">
            <Label htmlFor="displayName">Connection name</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={(event) => updateForm("displayName", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="applicationId">Application ID</Label>
            <Input
              id="applicationId"
              required
              placeholder="Enable Banking app id"
              value={form.applicationId}
              onChange={(event) => updateForm("applicationId", event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pemPrivateKey">PEM private key</Label>
            <textarea
              id="pemPrivateKey"
              required
              className="min-h-32 rounded-2xl border bg-background/60 p-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="-----BEGIN PRIVATE KEY-----"
              value={form.pemPrivateKey}
              onChange={(event) => updateForm("pemPrivateKey", event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="aspspName">Bank name</Label>
              <Input
                id="aspspName"
                required
                placeholder="e.g. DNB, Nordea"
                value={form.aspspName}
                onChange={(event) => updateForm("aspspName", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="aspspCountry">Bank country</Label>
              <Input
                id="aspspCountry"
                required
                maxLength={2}
                value={form.aspspCountry}
                onChange={(event) => updateForm("aspspCountry", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="psuType">PSU type</Label>
              <select
                id="psuType"
                className="h-11 rounded-2xl border bg-background/60 px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={form.psuType}
                onChange={(event) =>
                  updateForm("psuType", event.target.value as FormState["psuType"])
                }
              >
                <option value="personal">Personal</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={form.language}
                onChange={(event) => updateForm("language", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="validDays">Consent days</Label>
              <Input
                id="validDays"
                inputMode="numeric"
                value={form.validDays}
                onChange={(event) => updateForm("validDays", event.target.value)}
              />
            </div>
          </div>
          <Button disabled={loading} type="submit">
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Connect bank
          </Button>
        </form>

        {connections.length ? (
          <div className="grid gap-3">
            {connections.map((connection) => (
              <div
                key={connection.id}
                className="rounded-3xl border bg-background/40 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{connection.displayName}</p>
                    <p className="text-sm text-muted-foreground">
                      {connection.externalApplicationId}
                    </p>
                  </div>
                  <Badge className="w-fit">{connection.status}</Badge>
                </div>
                <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span className="inline-flex items-center gap-2">
                    <ShieldCheck className="size-4" />
                    {connection.hasConsentSession
                      ? "Session authorized"
                      : "Authorization needed"}
                  </span>
                  {connection.consentExpiresAt ? (
                    <span>
                      Consent expires{" "}
                      {new Date(connection.consentExpiresAt).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    disabled={
                      !connection.hasConsentSession ||
                      isConnectionSyncing(connection.id)
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => void queueSync(connection.id)}
                  >
                    {isConnectionSyncing(connection.id) ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Sync now
                  </Button>
                </div>
                <SyncRunStatus run={getRunForConnection(connection.id)} />
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
