import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { transactions } from "@/db/schema";
import { parseDescription } from "@/lib/classification/parser";
import { parseNorwegianDecimal } from "@/lib/classification/parser/norwegian";
import { normalizeMerchant } from "@/lib/finance/categorization";
import { parseMoneyToCents } from "@/lib/finance/money";
import { inngest } from "@/inngest/client";
import {
  backfillParsedFieldsSchema,
  parseJobEvent,
} from "@/inngest/lib/event-validation";
import { backfillParsedFieldsEvent, EVENT_NAMES } from "@/inngest/lib/events";
import { sendValidatedStepEvent } from "@/inngest/lib/send-event";

export const BATCH_SIZE = 200;
const UPDATE_CHUNK_SIZE = 25;

export type BackfillRow = {
  id: string;
  description: string;
  source: string;
  merchantName: string | null;
  originalCurrency: string | null;
  metadata: Record<string, unknown> | null;
};

export async function loadBackfillBatch(input: {
  householdId: string;
  afterId?: string;
  batchSize?: number;
}): Promise<BackfillRow[]> {
  const limit = input.batchSize ?? BATCH_SIZE;

  return db
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
        eq(transactions.householdId, input.householdId),
        eq(transactions.source, "enable_banking"),
        isNull(transactions.parserSource),
        input.afterId ? gt(transactions.id, input.afterId) : undefined,
      ),
    )
    .orderBy(asc(transactions.id))
    .limit(limit);
}

export async function applyBackfillBatch(rows: BackfillRow[]) {
  const pendingUpdates: Array<{
    id: string;
    values: Partial<typeof transactions.$inferInsert>;
  }> = [];
  let totalSkipped = 0;

  for (const row of rows) {
    const parsed = parseDescription(row.description, "enable_banking", {
      country: "NO",
    });

    if (!parsed) {
      pendingUpdates.push({
        id: row.id,
        values: { parserSource: "none", updatedAt: new Date() },
      });
      totalSkipped += 1;
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
      normalizedMerchantName: normalizeMerchant(merchantName ?? row.description),
      updatedAt: new Date(),
    };

    if (!row.merchantName && parsed.merchantName) {
      updates.merchantName = parsed.merchantName;
      updates.searchText = `${row.description} ${parsed.merchantName}`;
    }

    if (
      !row.originalCurrency &&
      parsed.metadata?.originalCurrency &&
      parsed.metadata?.originalAmount
    ) {
      updates.originalCurrency = String(
        parsed.metadata.originalCurrency,
      ).toUpperCase();
      updates.originalAmountCents = parseMoneyToCents(
        parseNorwegianDecimal(String(parsed.metadata.originalAmount)),
      );

      if (parsed.metadata?.exchangeRate) {
        updates.metadata = {
          ...(updates.metadata ?? row.metadata ?? {}),
          exchangeRate: parseNorwegianDecimal(
            String(parsed.metadata.exchangeRate),
          ),
        };
      }
    }

    pendingUpdates.push({ id: row.id, values: updates });
  }

  for (let i = 0; i < pendingUpdates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = pendingUpdates.slice(i, i + UPDATE_CHUNK_SIZE);
    await Promise.all(
      chunk.map((entry) =>
        db
          .update(transactions)
          .set(entry.values)
          .where(
            and(
              eq(transactions.id, entry.id),
              isNull(transactions.parserSource),
            ),
          ),
      ),
    );
  }

  return {
    totalUpdated: pendingUpdates.length - totalSkipped,
    totalSkipped,
    processed: pendingUpdates.length,
  };
}

export const backfillParsedFields = inngest.createFunction(
  {
    id: "backfill-parsed-fields",
    name: "Backfill parser and currency fields on existing transactions",
    triggers: backfillParsedFieldsEvent,
  },
  async ({ event, step }) => {
    const { householdId, afterId } = parseJobEvent(
      backfillParsedFieldsSchema,
      event.data,
      { eventName: EVENT_NAMES.backfillParsedFields },
    );

    const rows = await step.run("load-unparsed-batch", () =>
      loadBackfillBatch({ householdId, afterId }),
    );

    const batchResult = await step.run("apply-batch", () =>
      applyBackfillBatch(rows),
    );

    const lastScannedId = rows.at(-1)?.id;
    const continuationRequired =
      rows.length >= BATCH_SIZE && lastScannedId != null;

    if (continuationRequired) {
      await sendValidatedStepEvent(
        step,
        "continue-backfill-parsed-fields",
        EVENT_NAMES.backfillParsedFields,
        { householdId, afterId: lastScannedId },
      );
    }

    return {
      updated: batchResult.totalUpdated,
      skipped: batchResult.totalSkipped,
      processed: batchResult.processed,
      continuationRequired,
      householdId,
      lastScannedId,
    };
  },
);
