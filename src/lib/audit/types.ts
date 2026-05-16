/**
 * Audit event action names — dot-separated resource.verb format.
 *
 * Add new actions as needed. Keep the set bounded and intentional.
 */
export const AuditAction = {
  // Transactions
  TRANSACTION_CREATE: "transaction.create",
  TRANSACTION_UPDATE: "transaction.update",
  TRANSACTION_DELETE: "transaction.delete",
  TRANSACTION_ENRICH: "transaction.enrich",
  TRANSACTION_CLASSIFY: "transaction.classify",
  TRANSACTION_BULK_APPROVE: "transaction.bulk_approve",

  // Accounts
  ACCOUNT_CONNECT: "account.connect",
  ACCOUNT_DISCONNECT: "account.disconnect",
  ACCOUNT_UPDATE: "account.update",

  // Budgets
  BUDGET_CREATE: "budget.create",
  BUDGET_UPDATE: "budget.update",
  BUDGET_DELETE: "budget.delete",

  // Bills
  BILL_ACCEPT: "bill.accept",
  BILL_REJECT: "bill.reject",
  BILL_UPDATE: "bill.update",
  BILL_DETECT: "bill.detect",

  // Provider / Sync
  PROVIDER_AUTH_START: "provider.auth_start",
  PROVIDER_AUTH_CALLBACK: "provider.auth_callback",
  PROVIDER_SYNC_START: "provider.sync_start",
  PROVIDER_SYNC_SUCCESS: "provider.sync_success",
  PROVIDER_SYNC_FAILURE: "provider.sync_failure",

  // Security
  ACCESS_DENIED: "security.access_denied",
  CROSS_HOUSEHOLD_REJECTION: "security.cross_household",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export type AuditOutcome = "success" | "denied" | "failure";

export type AuditEventInput = {
  householdId: string;
  actorUserId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  outcome: AuditOutcome;
  requestId?: string;
  ipHash?: string;
  /** Safe, non-sensitive context. Never include secrets or PII. */
  metadata?: Record<string, unknown>;
};
