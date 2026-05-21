import { db } from "@/db";
import {
  budgets,
  budgetLines,
  categories,
  categoryGroups,
  financialAccounts,
  households,
  ingestionConnections,
  memberships,
  recurringBills,
  syncRuns,
  transactions,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

let emailCounter = 0;

function uniqueEmail(prefix = "user") {
  emailCounter += 1;
  return `${prefix}-${emailCounter}@integration.test`;
}

export async function createTestUser(
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const passwordHash =
    overrides.passwordHash ?? (await hashPassword("password12345"));
  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? "Test User",
      email: overrides.email ?? uniqueEmail(),
      defaultCurrency: overrides.defaultCurrency ?? "NOK",
      onboardingComplete: overrides.onboardingComplete ?? true,
      ...overrides,
      passwordHash,
    })
    .returning();
  return user;
}

export async function createTestHousehold(
  overrides: Partial<typeof households.$inferInsert> = {},
) {
  const [household] = await db
    .insert(households)
    .values({
      name: overrides.name ?? "Test Household",
      defaultCurrency: overrides.defaultCurrency ?? "NOK",
      ...overrides,
    })
    .returning();
  return household;
}

export async function createTestMembership(
  userId: string,
  householdId: string,
  role: (typeof memberships.$inferInsert)["role"] = "owner",
) {
  const [membership] = await db
    .insert(memberships)
    .values({ userId, householdId, role })
    .returning();
  return membership;
}

export async function createTestAccount(
  householdId: string,
  overrides: Partial<typeof financialAccounts.$inferInsert> = {},
) {
  const [account] = await db
    .insert(financialAccounts)
    .values({
      householdId,
      name: overrides.name ?? "Checking",
      kind: overrides.kind ?? "checking",
      currency: overrides.currency ?? "NOK",
      currentBalanceCents: overrides.currentBalanceCents ?? 0,
      isManual: overrides.isManual ?? true,
      ...overrides,
    })
    .returning();
  return account;
}

export async function createTestCategoryGroup(householdId: string) {
  const [group] = await db
    .insert(categoryGroups)
    .values({
      householdId,
      key: `group-${emailCounter}`,
      label: "Expenses",
      sortOrder: 0,
    })
    .returning();
  return group;
}

export async function createTestCategory(
  householdId: string,
  overrides: Partial<typeof categories.$inferInsert> = {},
) {
  const group =
    overrides.groupId != null
      ? { id: overrides.groupId }
      : await createTestCategoryGroup(householdId);

  const [category] = await db
    .insert(categories)
    .values({
      name: overrides.name ?? "Groceries",
      color: overrides.color ?? "#22c55e",
      icon: overrides.icon ?? "shopping-cart",
      isSystem: overrides.isSystem ?? false,
      ...overrides,
      householdId,
      groupId: overrides.groupId ?? group.id,
    })
    .returning();
  return category;
}

export async function createTestTransaction(
  householdId: string,
  accountId: string,
  overrides: Partial<typeof transactions.$inferInsert> = {},
) {
  const [transaction] = await db
    .insert(transactions)
    .values({
      description: overrides.description ?? "Test purchase",
      amountCents: overrides.amountCents ?? -5000,
      currency: overrides.currency ?? "NOK",
      date: overrides.date ?? "2025-05-01",
      source: overrides.source ?? "manual",
      status: overrides.status ?? "posted",
      searchText: overrides.searchText ?? "test purchase",
      ...overrides,
      householdId,
      accountId,
    })
    .returning();
  return transaction;
}

export async function createTestBudget(
  householdId: string,
  overrides: Partial<typeof budgets.$inferInsert> = {},
) {
  const [budget] = await db
    .insert(budgets)
    .values({
      householdId,
      name: overrides.name ?? "Monthly",
      type: overrides.type ?? "monthly",
      currency: overrides.currency ?? "NOK",
      ...overrides,
    })
    .returning();
  return budget;
}

export async function createTestBudgetLine(
  budgetId: string,
  categoryId: string,
  allocatedAmountCents = 100_000,
) {
  const [line] = await db
    .insert(budgetLines)
    .values({
      budgetId,
      categoryId,
      allocatedAmountCents,
      rolloverEnabled: false,
    })
    .returning();
  return line;
}

export async function createTestBill(
  householdId: string,
  overrides: Partial<typeof recurringBills.$inferInsert> = {},
) {
  const [bill] = await db
    .insert(recurringBills)
    .values({
      householdId,
      name: overrides.name ?? "Rent",
      merchantPattern: overrides.merchantPattern ?? "rent|landlord",
      cadence: overrides.cadence ?? "monthly",
      expectedAmountCents: overrides.expectedAmountCents ?? -150_000,
      ...overrides,
    })
    .returning();
  return bill;
}

export async function createTestConnection(
  householdId: string,
  overrides: Partial<typeof ingestionConnections.$inferInsert> = {},
) {
  const [connection] = await db
    .insert(ingestionConnections)
    .values({
      householdId,
      provider: overrides.provider ?? "enable_banking",
      displayName: overrides.displayName ?? "Test Bank",
      status: overrides.status ?? "active",
      ...overrides,
    })
    .returning();
  return connection;
}

export async function createTestSyncRun(
  connectionId: string,
  overrides: Partial<typeof syncRuns.$inferInsert> = {},
) {
  const [run] = await db
    .insert(syncRuns)
    .values({
      connectionId,
      provider: overrides.provider ?? "enable_banking",
      status: overrides.status ?? "succeeded",
      ...overrides,
    })
    .returning();
  return run;
}

/** Two isolated households with one owner user each. */
export async function createTwoHouseholds() {
  const userA = await createTestUser({ name: "User A", email: uniqueEmail("user-a") });
  const userB = await createTestUser({ name: "User B", email: uniqueEmail("user-b") });

  const householdA = await createTestHousehold({
    name: "Household A",
    createdById: userA.id,
  });
  const householdB = await createTestHousehold({
    name: "Household B",
    createdById: userB.id,
  });

  await createTestMembership(userA.id, householdA.id, "owner");
  await createTestMembership(userB.id, householdB.id, "owner");

  const accountA = await createTestAccount(householdA.id, { name: "Account A" });
  const accountB = await createTestAccount(householdB.id, { name: "Account B" });

  return {
    userA,
    userB,
    householdA,
    householdB,
    accountA,
    accountB,
  };
}
