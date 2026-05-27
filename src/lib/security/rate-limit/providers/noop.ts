import type { RateLimitProvider } from "../provider";

/** Allows all requests — used in tests and local dev without Redis. */
export const noopRateLimitProvider: RateLimitProvider = {
  async check() {
    return { allowed: true };
  },
};
