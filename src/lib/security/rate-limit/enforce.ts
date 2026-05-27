import { headers } from "next/headers";

import { rateLimitedError } from "@/lib/errors/catalog";

import { checkUpstashRateLimit } from "./providers/upstash";
import { getRateLimitProvider, resolveRateLimitProviderName } from "./get-provider";
import type { RateLimitPresetId } from "./presets";
import { resolveClientIp } from "./resolve-client-ip";

const DEFAULT_RATE_LIMIT_MESSAGE =
  "Too many requests. Please wait a moment and try again.";

export type EnforceRateLimitOptions = {
  userId?: string;
  headers?: Headers;
  message?: string;
};

function buildIdentifier(userId: string | undefined, headersList: Headers): string {
  if (userId) {
    return `user:${userId}`;
  }
  return `ip:${resolveClientIp(headersList)}`;
}

/**
 * Enforce a named rate limit inside a Server Action or API route.
 *
 * Authenticated callers are limited per userId; public endpoints per IP.
 * Throws `rateLimitedError` from the error catalog when denied.
 */
export async function enforceRateLimit(
  presetId: RateLimitPresetId,
  options?: EnforceRateLimitOptions,
): Promise<void> {
  const headersList = options?.headers ?? (await headers());
  const identifier = buildIdentifier(options?.userId, headersList);
  const message = options?.message ?? DEFAULT_RATE_LIMIT_MESSAGE;

  const providerName = resolveRateLimitProviderName();

  let allowed: boolean;

  if (providerName === "upstash") {
    const result = await checkUpstashRateLimit({ presetId, identifier });
    allowed = result.allowed;
  } else {
    const provider = getRateLimitProvider();
    const result = await provider.check({ presetId, identifier });
    allowed = result.allowed;
  }

  if (!allowed) {
    throw rateLimitedError(message);
  }
}

/** @deprecated Use `enforceRateLimit` with a preset id. */
export const enforceActionRateLimit = enforceRateLimit;
