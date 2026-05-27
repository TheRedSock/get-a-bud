import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { serverEnv } from "@/config/env";
import { logger } from "@/lib/logger";

import type { RateLimitProvider } from "../provider";
import { RATE_LIMIT_PRESETS, type RateLimitPresetId } from "../presets";

let redis: Redis | null = null;
const limiters = new Map<RateLimitPresetId, Ratelimit>();

function getRedis(): Redis {
  if (!redis) {
    const url = serverEnv.UPSTASH_REDIS_REST_URL;
    const token = serverEnv.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required when RATE_LIMIT_PROVIDER is upstash",
      );
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

function getLimiter(presetId: RateLimitPresetId): Ratelimit {
  const existing = limiters.get(presetId);
  if (existing) {
    return existing;
  }

  const preset = RATE_LIMIT_PRESETS[presetId];
  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.fixedWindow(preset.max, `${preset.windowSeconds} s`),
    prefix: `get-a-bud:ratelimit:${presetId}`,
  });
  limiters.set(presetId, limiter);
  return limiter;
}

export const upstashRateLimitProvider: RateLimitProvider = {
  async check({ presetId, identifier }) {
    const limiter = getLimiter(presetId);
    const result = await limiter.limit(identifier);
    return { allowed: result.success };
  },
};

export async function checkUpstashRateLimit(
  input: Parameters<RateLimitProvider["check"]>[0],
): Promise<{ allowed: boolean; failedOpen: boolean }> {
  try {
    const result = await upstashRateLimitProvider.check(input);
    return { ...result, failedOpen: false };
  } catch (error) {
    logger.warn("Rate limit provider error; failing open", {
      operation: "rateLimit.upstash",
      presetId: input.presetId,
      cause: error instanceof Error ? error.message : "unknown",
    });
    return { allowed: true, failedOpen: true };
  }
}
