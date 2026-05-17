import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------- Audit Events ----------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    householdId: text("household_id").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: text("outcome").notNull(),
    requestId: text("request_id"),
    ipHash: text("ip_hash"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("audit_events_household_created_idx").on(
      table.householdId,
      table.createdAt,
    ),
    index("audit_events_action_idx").on(table.action),
    index("audit_events_resource_idx").on(table.resourceType, table.resourceId),
  ],
);
