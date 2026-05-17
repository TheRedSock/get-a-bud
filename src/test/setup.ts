// Provide required env stubs for tests that import modules which trigger env validation.
// These are safe test values — never used for real connections.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/get_a_bud_test";
process.env.NEXTAUTH_SECRET ??= "test-secret-32-bytes-long-enough";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.FIELD_ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
