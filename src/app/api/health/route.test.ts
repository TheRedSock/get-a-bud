// Mock the db module to avoid importing the real database connection
vi.mock("@/db", () => ({
  pingDatabase: vi.fn(),
}));

// Avoid env validation during test module loading
vi.mock("@/config/env", () => ({
  serverEnv: {
    DATABASE_URL: "postgresql://stub:stub@localhost/stub",
    NEXTAUTH_SECRET: "stub",
    NEXTAUTH_URL: "http://localhost:3000",
    FIELD_ENCRYPTION_KEY: "stub",
    NODE_ENV: "test",
  },
  publicEnv: {},
}));

import { pingDatabase } from "@/db";
import { GET } from "./route";

const mockPingDatabase = vi.mocked(pingDatabase);

describe("GET /api/health", () => {
  it("returns 200 when database is healthy", async () => {
    mockPingDatabase.mockResolvedValue(true);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.timestamp).toBeDefined();
  });

  it("returns 503 when database is unhealthy", async () => {
    mockPingDatabase.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Service unavailable");
  });

  it("does not expose connection details in response", async () => {
    mockPingDatabase.mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("postgresql");
    expect(bodyStr).not.toContain("localhost");
    expect(bodyStr).not.toContain("password");
  });
});
