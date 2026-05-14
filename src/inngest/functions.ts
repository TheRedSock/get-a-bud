import { and, asc, eq, gte, gt, inArray, isNotNull, isNull, lt, lte, or, desc, sql } from "drizzle-orm";
import { cron, eventType } from "inngest";

import { db } from "@/db";
import {
  classificationModels,
  households,
  ingestionConnections,
  recurringBillHistory,
  syncRuns,
  transactions,
  transactionLinks,
  recurringBills,
} from "@/db/schema";
import {
  findOneSidedTransfers,
  findTransferMatches,
  isTransferCandidate,
  type TransferCandidate,
} from "@/lib/classification/linking";
import {
  classifyTransaction,
  loadModelFromJson,
  trainModel,
  type LoadedModel,
} from "@/lib/classification/model";
import { parseDescription } from "@/lib/classification/parser";
import { parseNorwegianDecimal } from "@/lib/classification/parser/norwegian";
import {
  detectRecurring,
  cadenceToExpectedDays,
  recurringMerchantKey,
} from "@/lib/classification/recurring";
import {
  addDays,
  adjustForBusinessDays,
  nextCadenceDate,
} from "@/lib/classification/recurring/calendar";
import type { BillCadence } from "@/lib/classification/recurring";
import { generateRelabel, type AutoLabelMetadata } from "@/lib/classification/relabel";
import type { ParsedDescription } from "@/lib/classification/parser/types";
import { detectCategory, normalizeMerchant } from "@/lib/finance/categorization";
import {
  resolveMerchantIdentity,
  type MerchantResolutionResult,
} from "@/lib/finance/merchants";
import { syncEnableBankingConnection } from "@/lib/ingestion/enable-banking/sync";
import { inngest } from "@/inngest/client";
import { unexpectedError } from "@/lib/errors/catalog";
import { logger } from "@/lib/logger";

const bankConnectionSyncEvent = eventType("bank.connection.sync");
const categorizeTransactionsEvent = eventType("transactions.categorize");
const linkTransferPairsEvent = eventType("transactions.link-transfers");
const detectRecurringBillsEvent = eventType("transactions.recurring.detect");
const notificationBatchEvent = eventType("notifications.batch");
const backfillParsedFieldsEvent = eventType("transactions.backfill-parsed-fields");
const retrainModelEvent = eventType("model.retrain");

type UserEditableMetadata = Record<string, unknown> & {
  userEdits?: {
    descriptionEdited?: boolean;
    merchantNameEdited?: boolean;
  };
};

type MerchantIdentityTransaction = {
  id: string;
  description: string;
  merchantName: string | null;
  transactionType: string | null;
  metadata?: Record<string, unknown> | null;
};

const INNGEST_STEP_LIMIT = 1000;
const INNGEST_CONTINUATION_STEP_BUFFER = 100;
const INNGEST_CONTINUATION_RUNTIME_MS = 45_000;

function createContinuationGuard(options?: {
  runtimeLimitMs?: number;
  stepBuffer?: number;
  stepLimit?: number;
}) {
  const startedAt = Date.now();
  const runtimeLimitMs =
    options?.runtimeLimitMs ?? INNGEST_CONTINUATION_RUNTIME_MS;
  const stepLimit = options?.stepLimit ?? INNGEST_STEP_LIMIT;
  const stepBuffer = options?.stepBuffer ?? INNGEST_CONTINUATION_STEP_BUFFER;
  let stepsUsed = 0;

  return {
    recordStep(count = 1) {
      stepsUsed += count;
    },
    shouldContinue() {
      return (
        stepsUsed >= stepLimit - stepBuffer ||
        Date.now() - startedAt >= runtimeLimitMs
      );
    },
    get stepsUsed() {
      return stepsUsed;
    },
  };
}

function merchantIdentityUpdates(
  transaction: MerchantIdentityTransaction,
  resolution: MerchantResolutionResult | null,
): Partial<typeof transactions.$inferInsert> {
  if (!resolution) return {};

  const metadata = (transaction.metadata ?? {}) as UserEditableMetadata;
  const updates: Partial<typeof transactions.$inferInsert> = {
    merchantId: resolution.merchantId,
  };

  const canUpdateMerchant = !metadata.userEdits?.merchantNameEdited;
  const canUpdateDescription =
    !metadata.userEdits?.descriptionEdited &&
    [
      "card_purchase",
      "foreign_purchase",
      "online_purchase",
      "vipps_purchase",
    ].includes(transaction.transactionType ?? "");

  if (canUpdateMerchant) {
    updates.merchantName = resolution.canonicalName;
  }

  if (canUpdateDescription) {
    updates.description = resolution.canonicalName;
  }

  if (updates.merchantName !== undefined || updates.description !== undefined) {
    const nextDescription = updates.description ?? transaction.description;
    const nextMerchantName =
      updates.merchantName !== undefined
        ? updates.merchantName
        : transaction.merchantName;
    updates.normalizedMerchantName = normalizeMerchant(
      nextMerchantName ?? nextDescription,
    );
    updates.searchText = `${nextDescription} ${nextMerchantName ?? ""}`;
  }

  return updates;
}

export const syncBankConnection = inngest.createFunction(
  {
    id: "sync-bank-connection",
    name: "Sync bank connection",
    triggers: bankConnectionSyncEvent,
  },
  async ({ event, step }) => {
    const connectionId = event.data.connectionId as string;
    const runId = typeof event.data.runId === "string" ? event.data.runId : undefined;

    const run = await step.run("prepare-sync-run", async () => {
      if (runId) {
        const [existingRun] = await db
          .update(syncRuns)
          .set({
            status: "running",
            startedAt: new Date(),
            finishedAt: null,
            errorCode: null,
            errorMessage: null,
          })
          .where(eq(syncRuns.id, runId))
          .returning();

        if (existingRun) {
          return existingRun;
        }
      }

      const [createdRun] = await db
        .insert(syncRuns)
        .values({
          connectionId,
          provider: "enable_banking",
          status: "running",
        })
        .returning();

      return createdRun;
    });

    try {
      const result = await step.run("sync-enable-banking", () =>
        syncEnableBankingConnection(connectionId, { syncRunId: run.id }),
      );

      if (result.continuationRequired) {
        await step.run("checkpoint-sync-run", () =>
          db
            .update(syncRuns)
            .set({
              status: "running",
              finishedAt: null,
              importedAccounts:
                result.progress?.importedAccounts ?? result.accounts.length,
              importedTransactions:
                result.progress?.importedTransactions ??
                result.transactions.length,
            })
            .where(eq(syncRuns.id, run.id)),
        );

        await step.sendEvent("continue-bank-sync", {
          name: "bank.connection.sync",
          data: { connectionId, runId: run.id },
        });

        return result;
      }

      if (result.rateLimitedUntil) {
        await step.run("pause-rate-limited-sync-run", () =>
          db
            .update(syncRuns)
            .set({
              status: "rate_limited",
              finishedAt: null,
              importedAccounts:
                result.progress?.importedAccounts ?? result.accounts.length,
              importedTransactions:
                result.progress?.importedTransactions ??
                result.transactions.length,
            })
            .where(eq(syncRuns.id, run.id)),
        );

        await step.sleepUntil(
          "wait-for-bank-rate-limit",
          result.rateLimitedUntil,
        );
        await step.sendEvent("retry-rate-limited-sync", {
          name: "bank.connection.sync",
          data: { connectionId, runId: run.id },
        });

        return result;
      }

      await step.run("finish-sync-run", () =>
        db
          .update(syncRuns)
          .set({
            status: "succeeded",
            finishedAt: new Date(),
            importedAccounts:
              result.progress?.importedAccounts ?? result.accounts.length,
            importedTransactions:
              result.progress?.importedTransactions ?? result.transactions.length,
          })
          .where(eq(syncRuns.id, run.id)),
      );

      const [conn] = await step.run("load-connection-household", () =>
        db
          .select({ householdId: ingestionConnections.householdId })
          .from(ingestionConnections)
          .where(eq(ingestionConnections.id, connectionId))
          .limit(1),
      );

      if (conn) {
        await step.sendEvent("categorize-imported-transactions", {
          name: "transactions.categorize",
          data: { connectionId, householdId: conn.householdId },
        });
      }

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown bank sync error";

      await step.run("fail-sync-run", () =>
        db
          .update(syncRuns)
          .set({
            status: "failed",
            finishedAt: new Date(),
            errorMessage: message,
          })
          .where(eq(syncRuns.id, run.id)),
      );

      logger.exception(
        unexpectedError(error, {
          operation: "inngest.syncBankConnection",
          connectionId,
          runId: run.id,
        }),
      );

      throw error;
    }
  },
);

export const scheduledBankSync = inngest.createFunction(
  {
    id: "scheduled-bank-sync",
    name: "Scheduled bank sync",
    triggers: cron("0 */6 * * *"),
  },
  async ({ step }) => {
    const now = new Date();
    const connections = await step.run("load-active-connections", () =>
      db
        .select({ id: ingestionConnections.id })
        .from(ingestionConnections)
        .where(
          and(
            eq(ingestionConnections.provider, "enable_banking"),
            eq(ingestionConnections.status, "connected"),
            isNotNull(ingestionConnections.consentSessionId),
            or(
              isNull(ingestionConnections.consentExpiresAt),
              gt(ingestionConnections.consentExpiresAt, now),
            ),
            or(
              isNull(ingestionConnections.rateLimitedUntil),
              lte(ingestionConnections.rateLimitedUntil, now),
            ),
          ),
        ),
    );

    await Promise.all(
      connections.map((connection) =>
        step.sendEvent(`sync-${connection.id}`, {
          name: "bank.connection.sync",
          data: { connectionId: connection.id },
        }),
      ),
    );

    return { queued: connections.length };
  },
);

export const categorizeTransactions = inngest.createFunction(
  {
    id: "categorize-transactions",
    name: "Categorize transactions",
    triggers: categorizeTransactionsEvent,
  },
  async ({ event, step }) => {
    let householdId =
      typeof event.data.householdId === "string"
        ? event.data.householdId
        : undefined;

    if (!householdId && typeof event.data.connectionId === "string") {
      const [conn] = await step.run("resolve-connection-household", () =>
        db
          .select({ householdId: ingestionConnections.householdId })
          .from(ingestionConnections)
          .where(eq(ingestionConnections.id, event.data.connectionId as string))
          .limit(1),
      );
      householdId = conn?.householdId;
    }

    if (!householdId) {
      return { updated: 0, skipped: "missing_household" };
    }

    const PAGE_SIZE = 200;

    const rows = await step.run("load-uncategorized", () =>
      db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.householdId, householdId),
            isNull(transactions.categoryId),
          ),
        )
        .limit(PAGE_SIZE),
    );

    // Load the latest Tier 2 model for this household (if one exists).
    // Model loading involves deserializing into a classifier instance which
    // cannot pass through Inngest step serialization, so we load the raw
    // data in a step and construct the model outside.
    const modelRow = await step.run("load-model-data", () =>
      loadHouseholdModelData(householdId),
    );

    let model: LoadedModel | null = null;
    if (modelRow) {
      try {
        model = loadModelFromJson(modelRow.modelJson, modelRow.thresholds);
      } catch {
        // Corrupted model — continue without Tier 2
        model = null;
      }
    }

    let updated = 0;
    let tier1 = 0;
    let tier2 = 0;
    let suggested = 0;

    for (const transaction of rows.filter((row) => !row.categoryId)) {
      const merchantResolution = await step.run(
        `resolve-merchant-${transaction.id}`,
        () =>
          resolveMerchantIdentity({
            householdId: transaction.householdId,
            transaction: {
              id: transaction.id,
              householdId: transaction.householdId,
              source: transaction.source,
              description: transaction.description,
              merchantName: transaction.merchantName,
              normalizedMerchantName: transaction.normalizedMerchantName,
              transactionType: transaction.transactionType,
              paymentChannel: transaction.paymentChannel,
              metadata: transaction.metadata,
            },
          }),
      );
      const identityUpdates = merchantIdentityUpdates(
        transaction,
        merchantResolution,
      );

      if (merchantResolution?.defaultCategoryId) {
        const merchantUpdates: Partial<typeof transactions.$inferInsert> = {
          ...identityUpdates,
          categoryId: merchantResolution.defaultCategoryId,
          categorySource: "merchant",
          categoryConfidence: Math.min(
            merchantResolution.confidence,
            0.95,
          ).toFixed(2),
          suggestedCategoryId: null,
          suggestedDescription: null,
          suggestedMerchantName: null,
          updatedAt: new Date(),
        };

        const nextDescription =
          merchantUpdates.description ?? transaction.description;
        const nextMerchantName =
          merchantUpdates.merchantName !== undefined
            ? merchantUpdates.merchantName
            : transaction.merchantName;
        const autoLabel: AutoLabelMetadata = {
          appliedAt: new Date().toISOString(),
          source: "merchant",
          confidence: Math.min(merchantResolution.confidence, 0.95),
          originalDescription: transaction.description,
          originalMerchantName: transaction.merchantName,
          appliedDescription: nextDescription,
          appliedMerchantName: nextMerchantName ?? null,
          appliedCategoryId: merchantResolution.defaultCategoryId,
          undone: false,
        };
        merchantUpdates.metadata = {
          ...(transaction.metadata ?? {}),
          autoLabel,
        };

        await step.run(`merchant-apply-${transaction.id}`, () =>
          db
            .update(transactions)
            .set(merchantUpdates)
            .where(eq(transactions.id, transaction.id)),
        );
        updated += 1;
        tier1 += 1;
        continue;
      }

      // Tier 1: Rule-based detection (returns null if no genuine match)
      const result = await step.run(`detect-${transaction.id}`, () =>
        detectCategory(
          transaction.householdId,
          transaction.description,
          transaction.merchantName,
          {
            normalizedMerchantName: transaction.normalizedMerchantName,
            counterparty:
              typeof transaction.metadata?.parsed === "object" &&
              transaction.metadata.parsed !== null &&
              "counterparty" in transaction.metadata.parsed &&
              typeof transaction.metadata.parsed.counterparty === "string"
                ? transaction.metadata.parsed.counterparty
                : null,
          },
        ),
      );

      if (result) {
        // Phase 3B: attempt relabeling for rule-based auto-apply
        const parsedMeta = transaction.metadata?.parsed as ParsedDescription | undefined;
        const relabel = generateRelabel(parsedMeta ?? null, {
          description: transaction.description,
          merchantName: transaction.merchantName,
          metadata: transaction.metadata,
        });

        const tier1Updates: Partial<typeof transactions.$inferInsert> = {
          ...identityUpdates,
          categoryId: result.categoryId,
          categorySource: result.source,
          categoryConfidence: result.confidence.toFixed(2),
          suggestedCategoryId: null,
          suggestedDescription: null,
          suggestedMerchantName: null,
          updatedAt: new Date(),
        };

        if (relabel) {
          const autoLabel: AutoLabelMetadata = {
            appliedAt: new Date().toISOString(),
            source: "rule",
            confidence: result.confidence,
            originalDescription: transaction.description,
            originalMerchantName: transaction.merchantName,
            appliedDescription: relabel.description,
            appliedMerchantName: relabel.merchantName,
            appliedCategoryId: result.categoryId,
            undone: false,
          };
          tier1Updates.description = relabel.description;
          tier1Updates.merchantName = relabel.merchantName;
          tier1Updates.normalizedMerchantName = normalizeMerchant(
            relabel.merchantName ?? relabel.description,
          );
          tier1Updates.searchText = `${relabel.description} ${relabel.merchantName ?? ""}`;
          if (relabel.notes && !transaction.notes) {
            tier1Updates.notes = relabel.notes;
          }
          tier1Updates.metadata = {
            ...(transaction.metadata ?? {}),
            autoLabel,
          };
        }

        Object.assign(tier1Updates, identityUpdates);

        await step.run(`update-${transaction.id}`, () =>
          db
            .update(transactions)
            .set(tier1Updates)
            .where(eq(transactions.id, transaction.id)),
        );
        updated += 1;
        tier1 += 1;
        continue;
      }

      // Tier 2: Statistical model (if model exists for household)
      if (model) {
        const prediction = classifyTransaction(model, {
          description: transaction.description,
          merchantName: transaction.merchantName,
          normalizedMerchantName: transaction.normalizedMerchantName,
          amount: transaction.amount,
          date: transaction.date,
          transactionType: transaction.transactionType,
          paymentChannel: transaction.paymentChannel,
          originalCurrency: transaction.originalCurrency,
        });

        if (prediction) {
          if (
            model.thresholds.autoApplyThreshold !== null &&
            prediction.score >= model.thresholds.autoApplyThreshold
          ) {
            // High score with validated threshold — auto-apply
            // Phase 3B: attempt relabeling for model-based auto-apply
            const parsedMeta = transaction.metadata?.parsed as ParsedDescription | undefined;
            const relabel = generateRelabel(parsedMeta ?? null, {
              description: transaction.description,
              merchantName: transaction.merchantName,
              metadata: transaction.metadata,
            });

            const modelUpdates: Partial<typeof transactions.$inferInsert> = {
              ...identityUpdates,
              categoryId: prediction.label,
              categorySource: "model",
              categoryConfidence: prediction.score.toFixed(2),
              suggestedCategoryId: null,
              suggestedDescription: null,
              suggestedMerchantName: null,
              updatedAt: new Date(),
            };

            if (relabel) {
              const autoLabel: AutoLabelMetadata = {
                appliedAt: new Date().toISOString(),
                source: "model",
                confidence: prediction.score,
                originalDescription: transaction.description,
                originalMerchantName: transaction.merchantName,
                appliedDescription: relabel.description,
                appliedMerchantName: relabel.merchantName,
                appliedCategoryId: prediction.label,
                undone: false,
              };
              modelUpdates.description = relabel.description;
              modelUpdates.merchantName = relabel.merchantName;
              modelUpdates.normalizedMerchantName = normalizeMerchant(
                relabel.merchantName ?? relabel.description,
              );
              modelUpdates.searchText = `${relabel.description} ${relabel.merchantName ?? ""}`;
              if (relabel.notes && !transaction.notes) {
                modelUpdates.notes = relabel.notes;
              }
              modelUpdates.metadata = {
                ...(transaction.metadata ?? {}),
                autoLabel,
              };
            }

            Object.assign(modelUpdates, identityUpdates);

            await step.run(`model-apply-${transaction.id}`, () =>
              db
                .update(transactions)
                .set(modelUpdates)
                .where(eq(transactions.id, transaction.id)),
            );
            updated += 1;
            tier2 += 1;
          } else if (
            model.thresholds.suggestThreshold !== null &&
            prediction.score >= model.thresholds.suggestThreshold
          ) {
            // Medium score — suggest but don't apply
            // Phase 3B: generate relabel suggestion alongside category suggestion
            const parsedMeta = transaction.metadata?.parsed as ParsedDescription | undefined;
            const relabel = generateRelabel(parsedMeta ?? null, {
              description: transaction.description,
              merchantName: transaction.merchantName,
              metadata: transaction.metadata,
            });

            await step.run(`model-suggest-${transaction.id}`, () =>
              db
                .update(transactions)
                .set({
                  ...identityUpdates,
                  suggestedCategoryId: prediction.label,
                  // When generateRelabel returns null, clear stale suggested
                  // description/merchant from any prior run
                  suggestedDescription: relabel?.description ?? null,
                  suggestedMerchantName: relabel?.merchantName ?? null,
                  categoryConfidence: prediction.score.toFixed(2),
                  updatedAt: new Date(),
                })
                .where(eq(transactions.id, transaction.id)),
            );
            suggested += 1;
          }
          // Below suggest threshold or thresholds not yet computed —
          // leave uncategorized. Surfaces in UI review queue.
        }
      }

      if (merchantResolution && Object.keys(identityUpdates).length > 0) {
        await step.run(`merchant-enrich-${transaction.id}`, () =>
          db
            .update(transactions)
            .set({ ...identityUpdates, updatedAt: new Date() })
            .where(eq(transactions.id, transaction.id)),
        );
      }
    }

    // If we processed a full page, there may be more uncategorized rows.
    // Re-enqueue and skip downstream work — link/recurring will run after
    // the final page completes.
    if (rows.length >= PAGE_SIZE) {
      await step.sendEvent("continue-categorize", {
        name: "transactions.categorize",
        data: { householdId },
      });
      return { updated, tier1, tier2, suggested };
    }

    // Final page: chain downstream work now that all categorization is done.
    await step.sendEvent("link-transfer-pairs", {
      name: "transactions.link-transfers",
      data: { householdId },
    });

    await step.sendEvent("detect-recurring-bills", {
      name: "transactions.recurring.detect",
      data: { householdId },
    });

    return { updated, tier1, tier2, suggested };
  },
);

// ---------------------------------------------------------------------------
// Phase 2A: Transfer linking
// ---------------------------------------------------------------------------

export const linkTransferPairs = inngest.createFunction(
  {
    id: "link-transfer-pairs",
    name: "Link transfer pairs",
    triggers: linkTransferPairsEvent,
  },
  async ({ event, step }) => {
    const householdId = event.data.householdId as string;
    const PAGE_SIZE = 200;

    // Load unlinked transfer candidates
    const candidates = await step.run("load-candidates", () =>
      db
        .select({
          id: transactions.id,
          householdId: transactions.householdId,
          accountId: transactions.accountId,
          amount: transactions.amount,
          currency: transactions.currency,
          date: transactions.date,
          transactionType: transactions.transactionType,
          transferGroupId: transactions.transferGroupId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.householdId, householdId),
            isNull(transactions.transferGroupId),
            isNotNull(transactions.transactionType),
            inArray(transactions.transactionType, [
              "internal_transfer",
              "investment",
            ]),
          ),
        )
        .limit(PAGE_SIZE),
    );

    if (candidates.length === 0) {
      return { linked: 0, oneSided: 0 };
    }

    // Run matching algorithm
    const matches = findTransferMatches(
      candidates as TransferCandidate[],
    );

    let linked = 0;

    for (const match of matches) {
      await step.run(`link-${match.groupId}`, async () => {
        // Create transaction_links rows (conflict-safe for retries)
        await db
          .insert(transactionLinks)
          .values([
            {
              householdId,
              groupId: match.groupId,
              transactionId: match.sourceId,
              role: "source",
              confidence: match.confidence.toFixed(2),
              confirmed: match.autoConfirm,
            },
            {
              householdId,
              groupId: match.groupId,
              transactionId: match.destinationId,
              role: "destination",
              confidence: match.confidence.toFixed(2),
              confirmed: match.autoConfirm,
            },
          ])
          .onConflictDoNothing();

        // Update convenience columns on both transactions
        const updates: Partial<typeof transactions.$inferInsert> = {
          transferGroupId: match.groupId,
          updatedAt: new Date(),
        };

        // High-confidence: auto-exclude from budget
        if (match.autoConfirm) {
          updates.excludedFromBudget = true;
        }

        await db
          .update(transactions)
          .set({ ...updates, linkedTransactionId: match.destinationId })
          .where(eq(transactions.id, match.sourceId));

        await db
          .update(transactions)
          .set({ ...updates, linkedTransactionId: match.sourceId })
          .where(eq(transactions.id, match.destinationId));
      });

      linked += 1;
    }

    // Handle one-sided transfers (exclude from budget even without a match)
    const matchedIds = new Set(
      matches.flatMap((m) => [m.sourceId, m.destinationId]),
    );
    const oneSidedIds = findOneSidedTransfers(
      candidates as TransferCandidate[],
      matchedIds,
    );

    if (oneSidedIds.length > 0) {
      await step.run("exclude-one-sided", () =>
        db
          .update(transactions)
          .set({ excludedFromBudget: true, updatedAt: new Date() })
          .where(
            and(
              inArray(transactions.id, oneSidedIds),
              eq(transactions.excludedFromBudget, false),
            ),
          ),
      );
    }

    // If we loaded a full page, there may be more candidates. Re-enqueue.
    if (candidates.length >= PAGE_SIZE) {
      await step.sendEvent("continue-link-transfers", {
        name: "transactions.link-transfers",
        data: { householdId },
      });
    }

    return { linked, oneSided: oneSidedIds.length };
  },
);

// ---------------------------------------------------------------------------
// Phase 2B: Enhanced recurring detection
// ---------------------------------------------------------------------------

type RecurringCandidateRow = {
  id: string;
  amount: string;
  currency: string;
  date: string;
  originalAmount: string | null;
  originalCurrency: string | null;
  merchantId: string | null;
  normalizedMerchantName: string | null;
  transactionType: string | null;
};

type ExistingRecurringBill = {
  id: string;
  merchantPattern: string;
  typicalDayOfMonth: number | null;
  expectedAmount: string | null;
  originalCurrency: string | null;
  cadence: string;
  nextDueDate: string | null;
  pattern: string | null;
};

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T12:00:00Z");
  const b = new Date(dateB + "T12:00:00Z");
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function dateDayOfMonth(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDate();
}

function monthCadenceStep(cadence: string): 1 | 3 | 6 | 12 | null {
  switch (cadence) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "semi_annual":
      return 6;
    case "yearly":
      return 12;
    default:
      return null;
  }
}

function advanceExpectedDueDate(
  dueDate: string,
  cadence: string,
  anchorDay: number,
): string {
  switch (cadence) {
    case "weekly":
      return addDays(dueDate, 7);
    case "biweekly":
      return addDays(dueDate, 14);
    case "monthly":
    case "quarterly":
    case "semi_annual":
    case "yearly":
      return nextCadenceDate(dueDate, anchorDay, cadence);
    default:
      return dueDate;
  }
}

function nextDueDateAfterPayment(
  paymentDate: string,
  bill: ExistingRecurringBill,
): string | null {
  const anchorDay = bill.typicalDayOfMonth ?? dateDayOfMonth(paymentDate);
  const next = advanceExpectedDueDate(paymentDate, bill.cadence, anchorDay);
  return next === paymentDate ? null : adjustForBusinessDays(next);
}

function dateMatchesBillCadence(
  row: RecurringCandidateRow,
  bill: ExistingRecurringBill,
): boolean {
  if (!bill.nextDueDate) {
    if (bill.typicalDayOfMonth == null) return true;
    const dom = dateDayOfMonth(row.date);
    return Math.abs(dom - bill.typicalDayOfMonth) <= 2;
  }

  const anchorDay = bill.typicalDayOfMonth ?? dateDayOfMonth(bill.nextDueDate);
  let expected = bill.nextDueDate;

  // Advance the expected date until it is close to or after the candidate.
  // This lets a known bill recover if one expected period was missed, while
  // still preventing quarterly/yearly bills from claiming monthly lookalikes.
  for (let i = 0; i < 36 && daysBetween(expected, row.date) > 2; i++) {
    const next = advanceExpectedDueDate(expected, bill.cadence, anchorDay);
    if (next === expected) break;
    expected = next;
  }

  if (Math.abs(daysBetween(expected, row.date)) <= 2) return true;

  // Fall back to calendar-period matching for anchored month cadences when the
  // predicted date was business-day adjusted but the bank posts on the anchor.
  const monthStep = monthCadenceStep(bill.cadence);
  if (monthStep == null || bill.typicalDayOfMonth == null) return false;

  const expectedDate = new Date(expected + "T12:00:00Z");
  const rowDate = new Date(row.date + "T12:00:00Z");
  const monthGap =
    (rowDate.getUTCFullYear() - expectedDate.getUTCFullYear()) * 12 +
    (rowDate.getUTCMonth() - expectedDate.getUTCMonth());

  if (monthGap < 0 || monthGap % monthStep !== 0) return false;

  const rowDom = rowDate.getUTCDate();
  const rowMonthLastDay = new Date(
    Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return (
    Math.abs(rowDom - bill.typicalDayOfMonth) <= 2 ||
    (bill.typicalDayOfMonth >= 29 &&
      rowDom === rowMonthLastDay &&
      rowMonthLastDay < bill.typicalDayOfMonth)
  );
}

function comparableAmountForBill(
  row: RecurringCandidateRow,
  bill: ExistingRecurringBill,
): number | null {
  if (bill.originalCurrency) {
    if (row.originalCurrency !== bill.originalCurrency || !row.originalAmount) {
      return null;
    }
    return Math.abs(Number(row.originalAmount));
  }

  return Math.abs(Number(row.amount));
}

export const detectRecurringBills = inngest.createFunction(
  {
    id: "detect-recurring-bills",
    name: "Detect recurring bills",
    triggers: detectRecurringBillsEvent,
  },
  async ({ event, step }) => {
    const householdId = event.data.householdId as string;
    const runStartTime = new Date();
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 24);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    // -----------------------------------------------------------------------
    // Load all expense transactions (24-month window)
    // -----------------------------------------------------------------------

    const PAGE_SIZE = 500;
    let offset = 0;
    let allRows: RecurringCandidateRow[] = [];

    let hasMore = true;
    while (hasMore) {
      const page = await step.run(`load-page-${offset}`, () =>
        db
          .select({
            id: transactions.id,
            amount: transactions.amount,
            currency: transactions.currency,
            date: transactions.date,
            originalAmount: transactions.originalAmount,
            originalCurrency: transactions.originalCurrency,
            merchantId: transactions.merchantId,
            normalizedMerchantName: transactions.normalizedMerchantName,
            transactionType: transactions.transactionType,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.householdId, householdId),
              lt(transactions.amount, "0"),
              gte(transactions.date, cutoffStr),
              eq(transactions.excludedFromBudget, false),
            ),
          )
          .orderBy(asc(transactions.date))
          .limit(PAGE_SIZE)
          .offset(offset),
      );

      allRows = allRows.concat(page);
      hasMore = page.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

    const txnMap = new Map(allRows.map((r) => [r.id, r]));

    // -----------------------------------------------------------------------
    // Phase A: Match new transactions against existing active bills
    // -----------------------------------------------------------------------
    // Transactions already linked to an active bill are "claimed" and
    // excluded from new-pattern detection in Phase B.

    const existingBills = await step.run("load-existing-bills", () =>
      db
        .select({
          id: recurringBills.id,
          merchantPattern: recurringBills.merchantPattern,
          typicalDayOfMonth: recurringBills.typicalDayOfMonth,
          expectedAmount: recurringBills.expectedAmount,
          originalCurrency: recurringBills.originalCurrency,
          cadence: recurringBills.cadence,
          nextDueDate: recurringBills.nextDueDate,
          pattern: recurringBills.pattern,
        })
        .from(recurringBills)
        .where(
          and(
            eq(recurringBills.householdId, householdId),
            eq(recurringBills.isActive, true),
          ),
        ),
    );

    const existingHistoryRows = await step.run("load-claimed-ids", () =>
      db
        .select({ transactionId: recurringBillHistory.transactionId })
        .from(recurringBillHistory)
        .innerJoin(
          recurringBills,
          eq(recurringBillHistory.billId, recurringBills.id),
        )
        .where(
          and(
            eq(recurringBills.householdId, householdId),
            eq(recurringBills.isActive, true),
            isNotNull(recurringBillHistory.transactionId),
          ),
        ),
    );

    const claimedIds = new Set<string>();
    for (const row of existingHistoryRows) {
      if (row.transactionId) claimedIds.add(row.transactionId);
    }

    // For each active bill, find unclaimed transactions that match its
    // pattern (merchant + amount ±15% + day-of-month ±2).
    let existingMatched = 0;
    for (const bill of existingBills) {
      const newMatches = allRows.filter((r) => {
        if (claimedIds.has(r.id)) return false;
        if (recurringMerchantKey(r) !== bill.merchantPattern) return false;
        if (bill.typicalDayOfMonth != null) {
          if (!dateMatchesBillCadence(r, bill)) return false;
        } else if (!dateMatchesBillCadence(r, bill)) {
          return false;
        }
        if (bill.expectedAmount) {
          const amt = comparableAmountForBill(r, bill);
          if (amt == null) return false;
          const expected = Number(bill.expectedAmount);
          if (
            Math.abs(amt - expected) / Math.max(expected, 0.01) >
            0.15
          ) {
            return false;
          }
        }
        return true;
      });

      if (newMatches.length > 0) {
        const historyRows = newMatches.map((t) => ({
          billId: bill.id,
          amount: Math.abs(Number(t.amount)).toFixed(2),
          originalAmount: t.originalAmount
            ? Math.abs(Number(t.originalAmount)).toFixed(2)
            : null,
          originalCurrency: t.originalCurrency,
          date: t.date,
          transactionId: t.id,
        }));

        await step.run(`match-existing-${bill.id}`, () =>
          db
            .insert(recurringBillHistory)
            .values(historyRows)
            .onConflictDoNothing(),
        );

        for (const m of newMatches) claimedIds.add(m.id);
        existingMatched += newMatches.length;

        // Update bill metadata with the most recent match
        const latest = newMatches.sort((a, b) =>
          b.date.localeCompare(a.date),
        )[0];
        const latestComparableAmount = comparableAmountForBill(latest, bill);
        const nextDueDate = nextDueDateAfterPayment(latest.date, bill);
        await step.run(`update-existing-${bill.id}`, () =>
          db
            .update(recurringBills)
            .set({
              lastDetectedAt: runStartTime,
              lastAmount: Math.abs(Number(latest.amount)).toFixed(2),
              expectedAmount:
                latestComparableAmount != null
                  ? latestComparableAmount.toFixed(2)
                  : bill.expectedAmount,
              nextDueDate,
              lastOriginalAmount: latest.originalAmount
                ? Math.abs(Number(latest.originalAmount)).toFixed(2)
                : null,
              originalCurrency: latest.originalCurrency,
              isPossiblyCancelled: false,
              updatedAt: new Date(),
            })
            .where(eq(recurringBills.id, bill.id)),
        );
      }
    }

    // -----------------------------------------------------------------------
    // Phase B: Detect new patterns from unclaimed transactions
    // -----------------------------------------------------------------------

    const unclaimed = allRows.filter(
      (r) => !claimedIds.has(r.id) && !isTransferCandidate(r.transactionType),
    );
    const results = detectRecurring(unclaimed);

    // Upsert detected bills and insert history rows
    let historyInserted = 0;
    for (const result of results) {
      const lastObs = result.lastAmounts[result.lastAmounts.length - 1];
      const amountStr = lastObs
        ? Math.abs(lastObs.value).toFixed(2)
        : null;

      const [bill] = await step.run(
        `upsert-${result.merchant}-${result.amountSignature}`,
        () =>
          db
            .insert(recurringBills)
            .values({
              householdId,
              name: result.merchant,
              merchantPattern: result.merchant,
              amountSignature: result.amountSignature,
              cadence: result.cadence,
              expectedAmount: amountStr,
              nextDueDate: result.predictedNextDate,
              lastAmount: amountStr,
              detectedCadenceConfidence: result.confidence.toFixed(2),
              pattern: result.pattern,
              typicalDayOfMonth: result.typicalDayOfMonth,
              originalCurrency: result.originalCurrency,
              lastOriginalAmount:
                result.lastOriginalAmount?.toFixed(2) ?? null,
              amountTrend: result.amountTrend,
              lastDetectedAt: runStartTime,
              transactionCount: result.transactionCount,
              isDuplicateSubscription: result.isDuplicateSubscription,
              isPossiblyCancelled: false,
            })
            .onConflictDoUpdate({
              target: [
                recurringBills.householdId,
                recurringBills.merchantPattern,
                recurringBills.amountSignature,
              ],
              set: {
                cadence: result.cadence,
                expectedAmount: amountStr ?? undefined,
                nextDueDate: result.predictedNextDate,
                lastAmount: amountStr ?? undefined,
                detectedCadenceConfidence: result.confidence.toFixed(2),
                pattern: result.pattern,
                typicalDayOfMonth: result.typicalDayOfMonth,
                originalCurrency: result.originalCurrency,
                lastOriginalAmount:
                  result.lastOriginalAmount?.toFixed(2) ?? null,
                amountTrend: result.amountTrend,
                lastDetectedAt: runStartTime,
                transactionCount: result.transactionCount,
                isDuplicateSubscription: result.isDuplicateSubscription,
                isPossiblyCancelled: false,
                isActive: true,
                updatedAt: new Date(),
              },
            })
            .returning({ id: recurringBills.id }),
      );

      // Insert history rows for this bill's transactions
      if (bill && result.transactionIds.length > 0) {
        const historyRows = result.transactionIds
          .map((txnId) => {
            const txn = txnMap.get(txnId);
            if (!txn) return null;
            return {
              billId: bill.id,
              amount: Math.abs(Number(txn.amount)).toFixed(2),
              originalAmount: txn.originalAmount
                ? Math.abs(Number(txn.originalAmount)).toFixed(2)
                : null,
              originalCurrency: txn.originalCurrency,
              date: txn.date,
              transactionId: txnId,
            };
          })
          .filter(
            (row): row is NonNullable<typeof row> => row !== null,
          );

        if (historyRows.length > 0) {
          const inserted = await step.run(
            `history-${result.merchant}-${result.amountSignature}`,
            () =>
              db
                .insert(recurringBillHistory)
                .values(historyRows)
                .onConflictDoNothing()
                .returning({ id: recurringBillHistory.id }),
          );
          historyInserted += inserted.length;
        }
      }
    }

    // -----------------------------------------------------------------------
    // Stale bill deactivation and cancellation detection
    // -----------------------------------------------------------------------

    // Do not deactivate active bills merely because the current sync did not
    // contain a new matching transaction. Cancellation is a time-based signal
    // below; deactivation should remain a user or explicit retention policy.

    // Cancellation detection: flag active bills whose predicted next date
    // has been exceeded by more than 1.5× their cadence interval.
    const activeBillsForCancellation = await step.run(
      "load-active-for-cancellation",
      () =>
        db
          .select({
            id: recurringBills.id,
            nextDueDate: recurringBills.nextDueDate,
            cadence: recurringBills.cadence,
          })
          .from(recurringBills)
          .where(
            and(
              eq(recurringBills.householdId, householdId),
              eq(recurringBills.isActive, true),
              eq(recurringBills.isPossiblyCancelled, false),
              isNotNull(recurringBills.nextDueDate),
            ),
          ),
    );

    const possiblyCancelledIds: string[] = [];
    const now = runStartTime.getTime();
    for (const bill of activeBillsForCancellation) {
      if (!bill.nextDueDate) continue;
      const expectedDays = cadenceToExpectedDays(
        bill.cadence as BillCadence,
      );
      const thresholdDays = expectedDays * 1.5;
      const dueMs = new Date(bill.nextDueDate + "T12:00:00Z").getTime();
      const daysSinceDue = (now - dueMs) / (1000 * 60 * 60 * 24);
      if (daysSinceDue > thresholdDays) {
        possiblyCancelledIds.push(bill.id);
      }
    }

    if (possiblyCancelledIds.length > 0) {
      await step.run("flag-cancellations", () =>
        db
          .update(recurringBills)
          .set({ isPossiblyCancelled: true, updatedAt: new Date() })
          .where(inArray(recurringBills.id, possiblyCancelledIds)),
      );
    }

    return {
      detected: results.length,
      existingMatched,
      duplicates: results.filter((r) => r.isDuplicateSubscription).length,
      priceChanges: results.filter((r) => r.priceChangeDetected).length,
      historyInserted,
      possiblyCancelled: possiblyCancelledIds.length,
    };
  },
);

// ---------------------------------------------------------------------------
// Tier 2 model helpers
// ---------------------------------------------------------------------------

interface HouseholdModelData {
  modelJson: string;
  thresholds: {
    autoApplyThreshold: number | null;
    suggestThreshold: number | null;
  };
}

/**
 * Load the raw model data for a household from the DB. Returns a
 * JSON-serializable structure (suitable for Inngest step return values).
 */
async function loadHouseholdModelData(
  householdId: string,
): Promise<HouseholdModelData | null> {
  const [row] = await db
    .select({
      modelData: classificationModels.modelData,
      autoApplyThreshold: classificationModels.autoApplyThreshold,
      suggestThreshold: classificationModels.suggestThreshold,
    })
    .from(classificationModels)
    .where(eq(classificationModels.householdId, householdId))
    .orderBy(desc(classificationModels.version))
    .limit(1);

  if (!row?.modelData) return null;

  return {
    modelJson: JSON.stringify(row.modelData),
    thresholds: {
      autoApplyThreshold: row.autoApplyThreshold != null
        ? Number(row.autoApplyThreshold)
        : null,
      suggestThreshold: row.suggestThreshold != null
        ? Number(row.suggestThreshold)
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 3A: Model retraining
// ---------------------------------------------------------------------------

export const retrainClassificationModel = inngest.createFunction(
  {
    id: "retrain-classification-model",
    name: "Retrain classification model",
    triggers: retrainModelEvent,
  },
  async ({ event, step }) => {
    const householdId = event.data.householdId as string;

    // Load all categorized transactions (user-confirmed or rule-based)
    const trainingData = await step.run("load-training-data", () =>
      db
        .select({
          description: transactions.description,
          merchantName: transactions.merchantName,
          normalizedMerchantName: transactions.normalizedMerchantName,
          amount: transactions.amount,
          date: transactions.date,
          transactionType: transactions.transactionType,
          paymentChannel: transactions.paymentChannel,
          originalCurrency: transactions.originalCurrency,
          categoryId: transactions.categoryId,
          categorySource: transactions.categorySource,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.householdId, householdId),
            isNotNull(transactions.categoryId),
            // Only use user-confirmed and rule-based as ground truth
            or(
              eq(transactions.categorySource, "user"),
              eq(transactions.categorySource, "rule"),
              eq(transactions.categorySource, "merchant"),
            ),
          ),
        ),
    );

    if (trainingData.length < 20) {
      return {
        skipped: true,
        reason: "insufficient_data",
        count: trainingData.length,
      };
    }

    const labeled = trainingData
      .filter((t) => t.categoryId !== null)
      .map((t) => ({
        description: t.description,
        merchantName: t.merchantName,
        normalizedMerchantName: t.normalizedMerchantName,
        amount: t.amount,
        date: t.date,
        transactionType: t.transactionType,
        paymentChannel: t.paymentChannel,
        originalCurrency: t.originalCurrency,
        categoryId: t.categoryId!,
      }));

    const modelOutput = await step.run("train-model", () =>
      trainModel(labeled),
    );

    if (!modelOutput) {
      return {
        skipped: true,
        reason: "insufficient_labeled",
        count: labeled.length,
      };
    }

    // Determine the next version number
    const [latestVersion] = await step.run("get-latest-version", () =>
      db
        .select({
          maxVersion: sql<number>`COALESCE(MAX(${classificationModels.version}), 0)`,
        })
        .from(classificationModels)
        .where(eq(classificationModels.householdId, householdId)),
    );

    const nextVersion = (latestVersion?.maxVersion ?? 0) + 1;

    // Store the model
    await step.run("save-model", () =>
      db.insert(classificationModels).values({
        householdId,
        modelData: JSON.parse(modelOutput.modelJson) as unknown[],
        version: nextVersion,
        trainedAt: new Date(),
        trainingTransactionCount: modelOutput.trainingCount,
        accuracy: modelOutput.accuracy.toFixed(3),
        autoApplyThreshold:
          modelOutput.thresholds.autoApplyThreshold?.toFixed(2) ?? null,
        suggestThreshold:
          modelOutput.thresholds.suggestThreshold?.toFixed(2) ?? null,
        metadata: {
          categoryCount: modelOutput.categoryCount,
        },
      }),
    );

    // Reset correction counter
    await step.run("reset-counter", () =>
      db
        .update(households)
        .set({ classificationCorrectionsSinceTrain: 0 })
        .where(eq(households.id, householdId)),
    );

    // Prune old model versions (keep last 3)
    if (nextVersion > 3) {
      await step.run("prune-old-models", () =>
        db
          .delete(classificationModels)
          .where(
            and(
              eq(classificationModels.householdId, householdId),
              lt(classificationModels.version, nextVersion - 2),
            ),
          ),
      );
    }

    return {
      trained: true,
      version: nextVersion,
      trainingCount: modelOutput.trainingCount,
      categoryCount: modelOutput.categoryCount,
      accuracy: modelOutput.accuracy,
      autoApplyThreshold: modelOutput.thresholds.autoApplyThreshold,
      suggestThreshold: modelOutput.thresholds.suggestThreshold,
    };
  },
);

export const backfillParsedFields = inngest.createFunction(
  {
    id: "backfill-parsed-fields",
    name: "Backfill parser and currency fields on existing transactions",
    triggers: backfillParsedFieldsEvent,
  },
  async ({ step }) => {
    const BATCH_SIZE = 200;
    const guard = createContinuationGuard();
    let totalUpdated = 0;
    let totalSkipped = 0;
    let processed = 0;

    const rows = await step.run("load-unparsed-batch", () =>
      db
        .select({
          id: transactions.id,
          description: transactions.description,
          source: transactions.source,
          merchantName: transactions.merchantName,
          originalCurrency: transactions.originalCurrency,
          metadata: transactions.metadata,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.source, "enable_banking"),
            isNull(transactions.parserSource),
          ),
        )
        .limit(BATCH_SIZE),
    );
    guard.recordStep();

    for (const row of rows) {
      const parsed = parseDescription(row.description, "enable_banking", {
        country: "NO",
      });

      if (!parsed) {
        // Mark as attempted so this row is not reloaded by continuation runs.
        await step.run(`skip-${row.id}`, () =>
          db
            .update(transactions)
            .set({ parserSource: "none", updatedAt: new Date() })
            .where(eq(transactions.id, row.id)),
        );
        guard.recordStep();
        totalSkipped += 1;
        processed += 1;

        if (guard.shouldContinue()) break;
        continue;
      }

      const merchantName = row.merchantName ?? parsed.merchantName ?? null;
      const updates: Partial<typeof transactions.$inferInsert> = {
        transactionType: parsed.transactionType,
        paymentChannel: parsed.paymentChannel,
        parserSource: "norwegian",
        metadata: {
          ...(row.metadata ?? {}),
          observedMerchantName: parsed.merchantName ?? merchantName,
          parsed: {
            transactionType: parsed.transactionType,
            paymentChannel: parsed.paymentChannel,
            merchantName: parsed.merchantName,
            merchantAddress: parsed.merchantAddress,
            counterparty: parsed.counterparty,
            purpose: parsed.purpose,
            metadata: parsed.metadata,
          },
        },
        normalizedMerchantName: normalizeMerchant(
          merchantName ?? row.description,
        ),
        updatedAt: new Date(),
      };

      // Only fill merchantName from parser if it wasn't already set
      if (!row.merchantName && parsed.merchantName) {
        updates.merchantName = parsed.merchantName;
        updates.searchText = `${row.description} ${parsed.merchantName}`;
      }

      // Phase 1C: populate original currency from foreign Visa lines
      if (
        !row.originalCurrency &&
        parsed.metadata?.originalCurrency &&
        parsed.metadata?.originalAmount
      ) {
        updates.originalCurrency = String(
          parsed.metadata.originalCurrency,
        ).toUpperCase();
        updates.originalAmount = parseNorwegianDecimal(
          String(parsed.metadata.originalAmount),
        );

        // Store exchange rate in metadata for reference
        if (parsed.metadata?.exchangeRate) {
          updates.metadata = {
            ...(updates.metadata ?? row.metadata ?? {}),
            exchangeRate: parseNorwegianDecimal(
              String(parsed.metadata.exchangeRate),
            ),
          };
        }
      }

      await step.run(`update-${row.id}`, () =>
        db
          .update(transactions)
          .set(updates)
          .where(eq(transactions.id, row.id)),
      );
      guard.recordStep();

      totalUpdated += 1;
      processed += 1;

      if (guard.shouldContinue()) break;
    }

    const continuationRequired =
      processed < rows.length ||
      rows.length >= BATCH_SIZE ||
      guard.shouldContinue();

    if (continuationRequired) {
      await step.sendEvent("continue-backfill-parsed-fields", {
        name: "transactions.backfill-parsed-fields",
        data: { continuation: true },
      });
      guard.recordStep();
    }

    return {
      updated: totalUpdated,
      skipped: totalSkipped,
      processed,
      continuationRequired,
      stepsUsed: guard.stepsUsed,
    };
  },
);

export const notificationBatch = inngest.createFunction(
  {
    id: "notification-batch",
    name: "Notification batch",
    triggers: notificationBatchEvent,
  },
  async () => ({ queued: 0, note: "Notification delivery is deferred." }),
);

export const functions = [
  syncBankConnection,
  scheduledBankSync,
  categorizeTransactions,
  linkTransferPairs,
  detectRecurringBills,
  retrainClassificationModel,
  backfillParsedFields,
  notificationBatch,
];
