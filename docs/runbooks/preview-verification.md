# Preview Verification Checklist

Run on the Vercel preview URL before merging high-risk PRs.

- [ ] App shell loads without CSP console errors (see [csp.md](./csp.md)).
- [ ] `/sign-in` and `/register` render.
- [ ] Authenticated dashboard loads (test account).
- [ ] Create manual transaction (smoke).
- [ ] Enable Banking settings page loads (no need to complete real bank auth on preview).
- [ ] `/api/health` returns `{ "status": "ok" }` with database connected.

Record preview URL and outcome in the PR description.
