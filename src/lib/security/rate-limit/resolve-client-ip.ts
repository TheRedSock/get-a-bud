/**
 * Best-effort client IP for unauthenticated rate limits (Vercel / proxies).
 */
export function resolveClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip")?.trim() ??
    "127.0.0.1"
  );
}
