import { relations } from "drizzle-orm";

import { users } from "./auth";
import { households, memberships } from "./households";
import { financialAccounts } from "./accounts";
import {
  transactions,
  transactionLinks,
} from "./transactions";
import {
  categories,
  categoryGroups,
  merchants,
  merchantAliases,
} from "./categories";
import { budgets } from "./budgets";
import { classificationModels } from "./classification";
import { recurringBills, recurringBillHistory } from "./bills";

// ---------- User Relations ----------

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

// ---------- Household Relations ----------

export const householdsRelations = relations(households, ({ many }) => ({
  memberships: many(memberships),
  accounts: many(financialAccounts),
  transactions: many(transactions),
  categories: many(categories),
  categoryGroups: many(categoryGroups),
  merchants: many(merchants),
  budgets: many(budgets),
  transactionLinks: many(transactionLinks),
  classificationModels: many(classificationModels),
}));

// ---------- Financial Account Relations ----------

export const financialAccountsRelations = relations(
  financialAccounts,
  ({ one, many }) => ({
    household: one(households, {
      fields: [financialAccounts.householdId],
      references: [households.id],
    }),
    transactions: many(transactions),
  }),
);

// ---------- Transaction Relations ----------

export const transactionsRelations = relations(transactions, ({ one }) => ({
  household: one(households, {
    fields: [transactions.householdId],
    references: [households.id],
  }),
  account: one(financialAccounts, {
    fields: [transactions.accountId],
    references: [financialAccounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  merchant: one(merchants, {
    fields: [transactions.merchantId],
    references: [merchants.id],
  }),
  suggestedCategory: one(categories, {
    fields: [transactions.suggestedCategoryId],
    references: [categories.id],
    relationName: "suggestedCategory",
  }),
}));

// ---------- Category Relations ----------

export const categoryGroupsRelations = relations(
  categoryGroups,
  ({ one, many }) => ({
    household: one(households, {
      fields: [categoryGroups.householdId],
      references: [households.id],
    }),
    categories: many(categories),
  }),
);

export const categoriesRelations = relations(categories, ({ one }) => ({
  household: one(households, {
    fields: [categories.householdId],
    references: [households.id],
  }),
  group: one(categoryGroups, {
    fields: [categories.groupId],
    references: [categoryGroups.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "parentChild",
  }),
}));

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  household: one(households, {
    fields: [merchants.householdId],
    references: [households.id],
  }),
  defaultCategory: one(categories, {
    fields: [merchants.defaultCategoryId],
    references: [categories.id],
  }),
  aliases: many(merchantAliases),
}));

export const merchantAliasesRelations = relations(
  merchantAliases,
  ({ one }) => ({
    household: one(households, {
      fields: [merchantAliases.householdId],
      references: [households.id],
    }),
    merchant: one(merchants, {
      fields: [merchantAliases.merchantId],
      references: [merchants.id],
    }),
  }),
);

// ---------- Transaction Link Relations ----------

export const transactionLinksRelations = relations(
  transactionLinks,
  ({ one }) => ({
    household: one(households, {
      fields: [transactionLinks.householdId],
      references: [households.id],
    }),
    transaction: one(transactions, {
      fields: [transactionLinks.transactionId],
      references: [transactions.id],
    }),
  }),
);

// ---------- Classification Relations ----------

export const classificationModelsRelations = relations(
  classificationModels,
  ({ one }) => ({
    household: one(households, {
      fields: [classificationModels.householdId],
      references: [households.id],
    }),
  }),
);

// ---------- Recurring Bill Relations ----------

export const recurringBillsRelations = relations(
  recurringBills,
  ({ one, many }) => ({
    household: one(households, {
      fields: [recurringBills.householdId],
      references: [households.id],
    }),
    category: one(categories, {
      fields: [recurringBills.categoryId],
      references: [categories.id],
    }),
    history: many(recurringBillHistory),
  }),
);

export const recurringBillHistoryRelations = relations(
  recurringBillHistory,
  ({ one }) => ({
    bill: one(recurringBills, {
      fields: [recurringBillHistory.billId],
      references: [recurringBills.id],
    }),
    transaction: one(transactions, {
      fields: [recurringBillHistory.transactionId],
      references: [transactions.id],
    }),
  }),
);
