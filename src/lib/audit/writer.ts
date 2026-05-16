import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { logger } from "@/lib/logger";

import type { AuditEventInput } from "./types";

/**
 * Writes an audit event to the database.
 *
 * This is a low-level writer. Prefer using `logAuditEvent()` from the
 * public API which handles error suppression.
 */
export async function writeAuditEvent(input: AuditEventInput): Promise<void> {
  await db.insert(auditEvents).values({
    householdId: input.householdId,
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome,
    requestId: input.requestId ?? null,
    ipHash: input.ipHash ?? null,
    metadata: input.metadata ?? null,
  });
}

/**
 * Fire-and-forget audit event writer.
 *
 * Audit write failures are logged but never propagate to the caller.
 * Business operations must not fail because of audit infrastructure issues.
 */
export function writeAuditEventAsync(input: AuditEventInput): void {
  writeAuditEvent(input).catch((error) => {
    logger.warn("Audit event write failed", {
      action: input.action,
      resourceType: input.resourceType,
      outcome: input.outcome,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
