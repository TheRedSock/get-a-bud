import { serverEnv } from "@/config/env";

import type { RateLimitProvider } from "./provider";
import { noopRateLimitProvider } from "./providers/noop";
import { upstashRateLimitProvider } from "./providers/upstash";

export type RateLimitProviderName = "upstash" | "noop";

export function resolveRateLimitProviderName(): RateLimitProviderName {
  const configured = serverEnv.RATE_LIMIT_PROVIDER;
  if (configured === "noop" || configured === "upstash") {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    return "upstash";
  }
  return "noop";
}

export function getRateLimitProvider(): RateLimitProvider {
  const name = resolveRateLimitProviderName();
  if (name === "upstash") {
    return upstashRateLimitProvider;
  }
  return noopRateLimitProvider;
}
