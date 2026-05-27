import { vi } from "vitest";

type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

const authState = vi.hoisted(() => ({
  user: null as SessionUser | null,
}));

// ---------------------------------------------------------------------------
// next/headers — controllable cookie store for step-up and other cookie logic
// ---------------------------------------------------------------------------

const cookieStore = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value != null ? { name, value } : undefined;
    },
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  })),
  headers: vi.fn(async () => new Map<string, string>()),
}));

// ---------------------------------------------------------------------------
// Auth session
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => {
    if (!authState.user?.id) {
      const { unauthorizedError } = await import("@/lib/errors/catalog");
      throw unauthorizedError();
    }
    return authState.user;
  }),
  getCurrentUser: vi.fn(async () => authState.user),
}));

// ---------------------------------------------------------------------------
// Rate limiting — bypassed in integration tests
// ---------------------------------------------------------------------------

vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(undefined),
  enforceActionRateLimit: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Audit — full action enum so tests don't break on new actions
// ---------------------------------------------------------------------------

vi.mock("@/lib/audit", () => ({
  AuditAction: {
    TRANSACTION_CREATE: "transaction.create",
    TRANSACTION_UPDATE: "transaction.update",
    TRANSACTION_DELETE: "transaction.delete",
    TRANSACTION_ENRICH: "transaction.enrich",
    TRANSACTION_CLASSIFY: "transaction.classify",
    TRANSACTION_BULK_APPROVE: "transaction.bulk_approve",
    ACCOUNT_CONNECT: "account.connect",
    ACCOUNT_DISCONNECT: "account.disconnect",
    ACCOUNT_UPDATE: "account.update",
    BUDGET_CREATE: "budget.create",
    BUDGET_UPDATE: "budget.update",
    BUDGET_DELETE: "budget.delete",
    CATEGORY_CREATE: "category.create",
    CATEGORY_UPDATE: "category.update",
    CATEGORY_DELETE: "category.delete",
    BILL_CREATE: "bill.create",
    BILL_ACCEPT: "bill.accept",
    BILL_REJECT: "bill.reject",
    BILL_UPDATE: "bill.update",
    BILL_DETECT: "bill.detect",
    ASSET_CREATE: "asset.create",
    ASSET_UPDATE: "asset.update",
    LIABILITY_CREATE: "liability.create",
    LIABILITY_UPDATE: "liability.update",
    PROVIDER_AUTH_START: "provider.auth_start",
    PROVIDER_AUTH_CALLBACK: "provider.auth_callback",
    PROVIDER_SYNC_START: "provider.sync_start",
    PROVIDER_SYNC_SUCCESS: "provider.sync_success",
    PROVIDER_SYNC_FAILURE: "provider.sync_failure",
    ACCESS_DENIED: "security.access_denied",
    CROSS_HOUSEHOLD_REJECTION: "security.cross_household",
  },
  writeAuditEvent: vi.fn().mockResolvedValue(undefined),
  writeAuditEventAsync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Inngest — no-op sends
// ---------------------------------------------------------------------------

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/inngest/lib/send-event", () => ({
  sendInngestEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Balance recalculation — no-op
// ---------------------------------------------------------------------------

vi.mock("@/lib/finance/balance", () => ({
  recalculateAccountBalance: vi.fn().mockResolvedValue(0),
}));

// ---------------------------------------------------------------------------
// Helpers for controlling test state
// ---------------------------------------------------------------------------

export function setIntegrationSession(user: SessionUser) {
  authState.user = user;
}

export function clearIntegrationSession() {
  authState.user = null;
}

/**
 * Simulate a valid step-up cookie for the given user.
 * Uses the real `issueStepUpCookie` which signs a JWT and writes to the
 * mocked cookie store above.
 */
export async function grantStepUp(userId: string) {
  const { issueStepUpCookie } = await import("@/lib/auth/step-up");
  await issueStepUpCookie(userId);
}

/** Clear the step-up cookie (simulates expired/absent step-up). */
export function clearStepUp() {
  cookieStore.delete("gab-step-up");
}

/** Reset all integration test state (session + cookies). */
export function resetIntegrationState() {
  authState.user = null;
  cookieStore.clear();
}
