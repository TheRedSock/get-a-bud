/**
 * Runs before integration tests. Overrides env so the app connects to the
 * Docker Compose test database instead of the dev/production Neon instance.
 *
 * Also patches the `@/db` module to use the `postgres` driver (TCP) instead
 * of `@neondatabase/serverless` (WebSocket) which cannot connect to local Postgres.
 */
const defaultUrl =
  "postgresql://get_a_bud:get_a_bud@127.0.0.1:5433/get_a_bud_test?sslmode=disable";

// Always override DATABASE_URL — never fall through to .env.local values.
process.env.DATABASE_URL = process.env.INTEGRATION_DATABASE_URL ?? defaultUrl;
process.env.NEXTAUTH_SECRET ??= "test-secret-32-bytes-long-enough!!";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.FIELD_ENCRYPTION_KEY ??=
  "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.SENTRY_DSN ??= "https://stub@o0.ingest.sentry.io/0";
process.env.ARCJET_KEY ??= "ajkey_ci_stub";
