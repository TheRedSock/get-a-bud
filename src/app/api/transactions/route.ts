import { and, desc, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { categories, financialAccounts, transactions } from "@/db/schema";
import { notFoundError } from "@/lib/errors/catalog";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { AuditAction, writeAuditEventAsync } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { recalculateAccountBalance } from "@/lib/finance/balance";
import { detectCategory, normalizeMerchant } from "@/lib/finance/categorization";
import {
  resolveMerchantIdentity,
  upsertMerchantFromUserCorrection,
} from "@/lib/finance/merchants";
import { getActiveHousehold } from "@/lib/finance/household";

import { createTransactionSchema } from "@/lib/finance/validation";
import { rateLimitedError } from "@/lib/errors/catalog";
import { authenticatedMutationRateLimit } from "@/lib/security/arcjet";
import { inngest } from "@/inngest/client";

export const GET = withApiHandler("transactions.list", async (request) => {
  const household = await getActiveHousehold();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  const rows = await db
    .select()
    .from(transactions)
    .where(
      query
        ? and(
            eq(transactions.householdId, household.householdId),
            ilike(transactions.searchText, `%${query}%`),
          )
        : eq(transactions.householdId, household.householdId),
    )
    .orderBy(desc(transactions.date))
    .limit(100);

  return NextResponse.json({ transactions: rows });
});

export const POST = withApiHandler("transactions.create", async (request, _ctx, { requestId }) => {
  const decision = await authenticatedMutationRateLimit.protect(request);
  if (decision.isDenied()) {
    throw rateLimitedError("Too many requests. Please try again shortly.");
  }

  const user = await requireUser();
  const household = await getActiveHousehold();
  const transactionInput = await validateJsonBody(
    request,
    createTransactionSchema,
    "Please provide a valid transaction account, amount, date and description.",
  );

  const [account] = await db
    .select({
      id: financialAccounts.id,
      householdId: financialAccounts.householdId,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, transactionInput.accountId))
    .limit(1);

  if (!account || account.householdId !== household.householdId) {
    throw notFoundError("Choose an account from this household.", {
      accountId: transactionInput.accountId,
      householdId: household.householdId,
    });
  }

  if (transactionInput.categoryId) {
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, transactionInput.categoryId),
          eq(categories.householdId, household.householdId),
        ),
      )
      .limit(1);

    if (!cat) {
      throw notFoundError("Choose a category from this household.", {
        categoryId: transactionInput.categoryId,
        householdId: household.householdId,
      });
    }
  }

  const normalizedMerchant = transactionInput.merchantName
    ? normalizeMerchant(transactionInput.merchantName)
    : normalizeMerchant(transactionInput.description);
  const merchantResolution = transactionInput.merchantName
    ? await resolveMerchantIdentity({
        householdId: household.householdId,
        transaction: {
          description: transactionInput.description,
          merchantName: transactionInput.merchantName,
          normalizedMerchantName: normalizedMerchant,
          source: "manual",
        },
      })
    : null;
  const detectionResult =
    transactionInput.categoryId || merchantResolution?.defaultCategoryId
      ? null
      : await detectCategory(
          household.householdId,
          transactionInput.description,
          transactionInput.merchantName,
          { normalizedMerchantName: normalizedMerchant },
        );
  const categoryId =
    transactionInput.categoryId ??
    merchantResolution?.defaultCategoryId ??
    detectionResult?.categoryId ??
    null;
  const categorySource = transactionInput.categoryId
    ? "user"
    : merchantResolution?.defaultCategoryId
      ? "merchant"
      : detectionResult
        ? "rule"
        : null;
  const categoryConfidence = merchantResolution?.defaultCategoryId
    ? Math.min(merchantResolution.confidence, 0.95).toFixed(2)
    : detectionResult?.confidence?.toFixed(2) ?? null;
  const nextMerchantName =
    merchantResolution && transactionInput.merchantName
      ? merchantResolution.canonicalName
      : transactionInput.merchantName;
  const nextDescription =
    merchantResolution && transactionInput.merchantName
      ? merchantResolution.canonicalName
      : transactionInput.description;

  const [transaction] = await db
    .insert(transactions)
    .values({
      householdId: household.householdId,
      accountId: transactionInput.accountId,
      merchantId: merchantResolution?.merchantId ?? null,
      categoryId,
      categorySource,
      categoryConfidence,
      amountCents: transactionInput.amountCents,
      currency: transactionInput.currency,
      date: transactionInput.date,
      merchantName: nextMerchantName,
      normalizedMerchantName: normalizeMerchant(nextMerchantName ?? nextDescription),
      description: nextDescription,
      notes: transactionInput.notes,
      searchText: `${nextDescription} ${nextMerchantName ?? ""}`,
      source: "manual",
    })
    .returning();

  if (transactionInput.categoryId && transactionInput.merchantName) {
    await upsertMerchantFromUserCorrection({
      householdId: household.householdId,
      categoryId: transactionInput.categoryId,
      transaction: {
        id: transaction.id,
        householdId: household.householdId,
        source: "manual",
        description: transactionInput.description,
        merchantName: transactionInput.merchantName,
        normalizedMerchantName: normalizedMerchant,
        metadata: transaction.metadata,
      },
      displayMerchantName: transactionInput.merchantName,
    });
  }

  await recalculateAccountBalance(transactionInput.accountId);

  // If Tier 1 rules didn't match, enqueue categorization so the Tier 2
  // statistical model gets a chance to classify this transaction.
  if (!categoryId) {
    await inngest.send({
      name: "transactions.categorize",
      data: { householdId: household.householdId },
    });
  }

  writeAuditEventAsync({
    householdId: household.householdId,
    actorUserId: user.id!,
    action: AuditAction.TRANSACTION_CREATE,
    resourceType: "transaction",
    resourceId: transaction.id,
    outcome: "success",
    requestId,
  });

  return NextResponse.json({ transaction }, { status: 201 });
});
