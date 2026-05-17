import { eq } from "drizzle-orm";

import { db } from "@/db";
import { ingestionConnections } from "@/db/schema";

export type ConnectionSummary = {
  id: string;
  displayName: string;
  provider: string;
  status: string;
  externalApplicationId: string | null;
  hasConsentSession: boolean;
  authorizationId: string | null;
  authorizationStateExpiresAt: Date | null;
  consentExpiresAt: Date | null;
  lastSyncedAt: Date | null;
  rateLimitedUntil: Date | null;
};

/**
 * Load all ingestion connections for a household, hiding the raw
 * consentSessionId and exposing a boolean flag instead.
 */
export async function getHouseholdConnections(
  householdId: string,
): Promise<ConnectionSummary[]> {
  const rows = await db
    .select({
      id: ingestionConnections.id,
      displayName: ingestionConnections.displayName,
      provider: ingestionConnections.provider,
      externalApplicationId: ingestionConnections.externalApplicationId,
      consentSessionId: ingestionConnections.consentSessionId,
      status: ingestionConnections.status,
      authorizationId: ingestionConnections.authorizationId,
      authorizationStateExpiresAt:
        ingestionConnections.authorizationStateExpiresAt,
      consentExpiresAt: ingestionConnections.consentExpiresAt,
      lastSyncedAt: ingestionConnections.lastSyncedAt,
      rateLimitedUntil: ingestionConnections.rateLimitedUntil,
    })
    .from(ingestionConnections)
    .where(eq(ingestionConnections.householdId, householdId));

  return rows.map(({ consentSessionId, ...connection }) => ({
    ...connection,
    hasConsentSession: Boolean(consentSessionId),
  }));
}
