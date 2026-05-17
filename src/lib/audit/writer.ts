import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { logger } from "@/lib/logger";

import type { AuditEventInput } from "./types";

/**
 * Writes an audit event to the database (awaited / durable).
 *
 * Use this for critical financial mutations where losing the audit record
 * is unacceptable. The caller awaits the write, so failures propagate.
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
 * Use for non-critical audit events where the business operation must not
 * fail because of audit infrastructure issues (e.g., enqueue-only actions,
 * read-side events).
 *
 * For critical financial mutations (transaction create/update/delete, account
 * changes, bulk approvals), prefer `writeAuditEvent` (awaited).
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
