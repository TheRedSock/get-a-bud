import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { classificationModels, transactions } from "@/db/schema";
import { normalizeMerchant } from "@/lib/finance/categorization";
import type { MerchantResolutionResult } from "@/lib/finance/merchants";

type UserEditableMetadata = Record<string, unknown> & {
  userEdits?: {
    descriptionEdited?: boolean;
    merchantNameEdited?: boolean;
  };
};

export type MerchantIdentityTransaction = {
  id: string;
  description: string;
  merchantName: string | null;
  transactionType: string | null;
  metadata?: Record<string, unknown> | null;
};

export function merchantIdentityUpdates(
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

export interface HouseholdModelData {
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
export async function loadHouseholdModelData(
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
      autoApplyThreshold:
        row.autoApplyThreshold != null
          ? Number(row.autoApplyThreshold)
          : null,
      suggestThreshold:
        row.suggestThreshold != null ? Number(row.suggestThreshold) : null,
    },
  };
}
