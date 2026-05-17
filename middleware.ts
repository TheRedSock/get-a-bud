import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that are intentionally public or use their own auth model:
 * - /api/auth/*  – NextAuth sign-in/callback/session endpoints
 * - /api/inngest  – Inngest webhook (authenticated by Inngest signing key)
 * - /api/callback – Enable Banking OAuth redirect (state-validated internally)
 * - /api/health – uptime probe with minimal safe output
 */
const publicApiPrefixes = [
  "/api/auth",
  "/api/inngest",
  "/api/callback",
  "/api/health",
];

/** Pages that are accessible without authentication. */
const publicPages = new Set([
  "/",
  "/sign-in",
  "/register",
  "/demo",
  "/privacy",
  "/terms",
]);

function isPublicApi(pathname: string) {
  return publicApiPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isStaticOrInternal(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  );
}

export function createAuthMiddleware(getAuthToken: typeof getToken = getToken) {
  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip static assets and Next.js internals
    if (isStaticOrInternal(pathname)) {
      return NextResponse.next();
    }

    // Allow explicitly public API routes through
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }

    const token = await getAuthToken({ req: request });

    // Protect API routes: return 401 JSON for unauthenticated requests
    if (pathname.startsWith("/api/")) {
      if (!token) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "authentication_required",
              message: "Please sign in to continue.",
              requestId:
                request.headers.get("x-request-id") ?? crypto.randomUUID(),
            },
          },
          { status: 401 },
        );
      }
      return NextResponse.next();
    }

    // Protect app pages: redirect unauthenticated users to /sign-in
    if (!publicPages.has(pathname) && !token) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
  };
}

export const middleware = createAuthMiddleware();

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and Next.js internals.
     * This is the recommended Next.js matcher that excludes:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
