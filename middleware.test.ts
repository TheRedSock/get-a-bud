import { NextRequest } from "next/server";
import { createAuthMiddleware } from "./middleware";

const getTokenMock = vi.fn();
const middleware = createAuthMiddleware(async () => getTokenMock());

function createRequest(path: string, method = "GET") {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method });
}

describe("middleware auth guards", () => {
  afterEach(() => {
    getTokenMock.mockReset();
  });

  it("allows public API routes without authentication", async () => {
    getTokenMock.mockResolvedValue(null);

    for (const path of [
      "/api/auth/session",
      "/api/auth/signin",
      "/api/inngest",
      "/api/callback",
      "/api/health",
    ]) {
      const response = await middleware(createRequest(path));
      expect(response.status).not.toBe(401);
    }
  });

  it("returns 401 JSON for unauthenticated API requests", async () => {
    getTokenMock.mockResolvedValue(null);

    const response = await middleware(createRequest("/api/transactions"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "authentication_required",
        message: "Please sign in to continue.",
      },
    });
  });

  it("allows authenticated API requests through", async () => {
    getTokenMock.mockResolvedValue({ id: "user-1" });

    const response = await middleware(createRequest("/api/transactions"));

    // NextResponse.next() returns 200
    expect(response.status).toBe(200);
  });

  it("redirects unauthenticated app page requests to sign-in", async () => {
    getTokenMock.mockResolvedValue(null);

    const response = await middleware(createRequest("/dashboard"));

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/sign-in");
    expect(location).toContain("callbackUrl=%2Fdashboard");
  });

  it("allows public pages without authentication", async () => {
    getTokenMock.mockResolvedValue(null);

    for (const path of ["/", "/sign-in", "/register", "/demo", "/privacy", "/terms"]) {
      const response = await middleware(createRequest(path));
      expect(response.status).not.toBe(307);
      expect(response.status).not.toBe(401);
    }
  });

  it("allows authenticated users to access app pages", async () => {
    getTokenMock.mockResolvedValue({ id: "user-1" });

    const response = await middleware(createRequest("/dashboard"));
    expect(response.status).toBe(200);
  });
});
