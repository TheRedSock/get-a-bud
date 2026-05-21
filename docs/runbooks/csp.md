# Content Security Policy

Configured in `next.config.ts`.

## Phase A (current)

- Production: `unsafe-eval` removed; `script-src` still includes `unsafe-inline` for Next.js and telemetry compatibility.
- `style-src` includes `unsafe-inline` (Tailwind / Next).
- Allowed connect hosts: Enable Banking API, Sentry, Neon, Inngest, Arcjet, Vercel Live.

## Phase B (planned)

1. Enable nonce-based `script-src` on preview.
2. Smoke-test: `/`, `/sign-in`, `/register`, authenticated dashboard.
3. Confirm Sentry and Vercel analytics still load.
4. Remove production `unsafe-inline` when preview is clean.

Document any remaining inline exceptions in this file.
