import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { households } from "./households";
import {
  ingestionConnections,
  syncRuns,
  syncStatusEnum,
} from "./ingestion";

// ---------- Enums ----------

export const pipelineKindEnum = pgEnum("pipeline_kind", [
  "full_post_sync",
  "recurring_replay",
  "categorize",
]);

export const pipelinePhaseEnum = pgEnum("pipeline_phase", [
  "sync",
  "categorize",
  "link",
  "recurring",
  "done",
]);

export const pipelineActivityKindEnum = pgEnum("pipeline_activity_kind", [
  "phase_started",
  "phase_completed",
  "transaction_imported",
  "transaction_categorized",
  "transfer_linked",
  "bill_detected",
  "bill_updated",
  "account_imported",
  "error",
]);

// ---------- Household pipeline runs ----------

export type PipelineCounters = {
  importedAccounts?: number;
  importedTransactions?: number;
  categorized?: number;
  linkedPairs?: number;
  billsCreated?: number;
  billsUpdated?: number;
  billsFlagged?: number;
};

export type PipelinePhaseProgress = {
  afterId?: string;
  pagesFetched?: number;
  currentAccountName?: string;
  connectionDisplayName?: string;
  lastStepId?: string;
};

export const householdPipelineRuns = pgTable(
  "household_pipeline_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: pipelineKindEnum("kind").notNull(),
    status: syncStatusEnum("status").notNull().default("queued"),
    currentPhase: pipelinePhaseEnum("current_phase").notNull().default("sync"),
    connectionId: text("connection_id").references(
      () => ingestionConnections.id,
      { onDelete: "set null" },
    ),
    syncRunId: text("sync_run_id").references(() => syncRuns.id, {
      onDelete: "set null",
    }),
    counters: jsonb("counters").$type<PipelineCounters>().notNull().default({}),
    phaseProgress: jsonb("phase_progress")
      .$type<PipelinePhaseProgress>()
      .notNull()
      .default({}),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("household_pipeline_runs_household_status_idx").on(
      table.householdId,
      table.status,
    ),
    index("household_pipeline_runs_connection_idx").on(table.connectionId),
    index("household_pipeline_runs_sync_run_idx").on(table.syncRunId),
  ],
);

// ---------- Activity events (Phase C feed) ----------

export const pipelineActivityEvents = pgTable(
  "pipeline_activity_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    pipelineRunId: text("pipeline_run_id")
      .notNull()
      .references(() => householdPipelineRuns.id, { onDelete: "cascade" }),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: pipelineActivityKindEnum("kind").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("pipeline_activity_events_run_occurred_idx").on(
      table.pipelineRunId,
      table.occurredAt,
    ),
    index("pipeline_activity_events_household_idx").on(table.householdId),
  ],
);
