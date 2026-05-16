---
name: api-layer
description: Use when working on src/app/api/ route handlers, server actions, authentication, authorization, or tenancy enforcement. Covers the server action spine, route handler wrapping, error handling patterns, and auth/authorization guards.
---

# API Layer — Server Actions & Route Handlers

Source: `docs/philosophy.md` sections 8 (Auth, Authorization & Tenancy),
9 (API Layer), and 14 (Error Handling).

## Server Action Spine (preferred for mutations)

One action per operation. Every server action follows the same spine:

```
authenticate -> validate -> authorize -> execute -> return typed result
```

- **Authenticate first.** Get the session. Reject unauthenticated requests
  immediately.
- **Validate with Zod.** All input passes through a Zod schema. Never trust
  raw client input.
- **Authorize against household.** Verify the user has permission for the
  operation and that all referenced entities belong to the active household.
- **Execute by calling domain functions.** No raw SQL, no heavy logic in the
  action itself. The action is a thin controller.
- **Return typed results.** `{ data } | { error }`. Never throw raw errors
  to the client.
- **Rate-limit sensitive actions** via Arcjet before they hit business logic.

### Naming Convention

Server actions use camelCase with `Action` suffix: `createBudgetAction`,
`deleteTransactionAction`.

## Route Handlers (for webhooks, external integrations)

Use route handlers only for things server actions cannot do: webhooks, file
downloads, SSE, external API callbacks.

- **Wrap with `withApiHandler()`** from `src/lib/errors/api.ts`. This
  normalizes errors into a standard JSON envelope with a request ID.
- **Validate request bodies with Zod.** Use `validateJsonBody()`. Let field
  errors flow through the standard error envelope.
- **Validate request signatures** for all inbound webhooks.

## Authentication, Authorization & Tenancy

### Non-Negotiable Security Rules

- Every privileged action checks authorization **on the server.**
- Never rely on UI gating for access control. UI hides affordances; the server
  enforces rules.
- Assume client input is hostile. Validate all external inputs.
- Session state is untrusted until verified server-side.

### Mental Model

| Concept | Question |
|---------|----------|
| Authentication | Who are you? |
| Authorization | What may you do? |
| Tenancy | What data can you see? |
| Ownership | What records belong to your household? |

Do not mix these into ad hoc checks scattered through UI code. Use centralized
guard helpers at the top of every server action and route handler.

### Household-Scoped Multi-Tenancy

All financial data is scoped to **households**, not individual users.

- Validate user-supplied foreign keys against the active household before writes.
- Never expose records from one household to a user in another.
- Keep user-editable account metadata separate from provider-owned identity data.

## Error Handling

### Three Categories

| Category | Example | Handling |
|----------|---------|----------|
| Expected business errors | "Already imported", invalid input | Return as typed results. No throw. No Sentry. |
| Unexpected system errors | DB timeout, third-party outage | Log to Sentry with context. Return generic user-safe message. |
| Crashes | Unhandled exceptions | Sentry catches automatically. |

### Rules

- **Use `AppError` factories** from `src/lib/errors/catalog.ts`. No ad hoc
  `{ error: string }` responses.
- **Client code uses `parseApiResponse()`** to extract data or typed error,
  and `showErrorToast()` for user-facing messages.
- **Toast messages must be human-readable and actionable.** Never show raw
  provider, database, token, session, or stack messages.
  Bad: "Something went wrong."
  Good: "We couldn't save your budget. Your data is safe — please try again."
- **Error boundaries on all major page sections.** A broken chart must not
  crash the whole dashboard.
- Log errors once, not five times across the call stack.

### Important Distinction

Expected business errors are normal control flow. Unexpected system errors are
incident-worthy events. Do not collapse them into the same handling path.

## Security — Arcjet & Runtime Protection

- Apply Arcjet guards at the top of public API routes and sensitive server
  actions. Protect before any database query.
- Rate limit by userId (authenticated) and IP (unauthenticated).
- Bot detection on public-facing routes.
- Shield rules on all mutation endpoints.
- Centralize Arcjet rules as named presets in the security module. Reference
  presets by name, not inline definitions.
- Never store secrets, credentials, auth codes, session IDs, key material,
  raw headers, or tokens in logs, client state, or unencrypted database fields.

## Self-Audit Checklist

Before completing API layer work, verify:

- [ ] Server action follows authenticate -> validate -> authorize -> execute
- [ ] All input validated with Zod schema
- [ ] Household ownership checked for all referenced entity IDs
- [ ] Expected errors use `AppError` from the catalog
- [ ] Unexpected errors logged to Sentry with context
- [ ] Client gets a safe, human-readable error message
- [ ] Route handlers wrapped with `withApiHandler()`
- [ ] Webhook signatures validated
- [ ] Rate limiting applied via Arcjet for sensitive operations
- [ ] No raw SQL or heavy business logic in the action itself
- [ ] No internal error details exposed to the client
- [ ] Action has a household-isolation test (or one is needed)
