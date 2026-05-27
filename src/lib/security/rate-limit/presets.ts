/**
 * Named rate-limit presets. Route handlers and server actions reference these
 * by id — never inline window/max values at call sites.
 */
export const RATE_LIMIT_PRESET_IDS = [
  "register",
  "auth",
  "integrationAuth",
  "authenticatedMutation",
  "bulkOperation",
  "queueEnqueue",
] as const;

export type RateLimitPresetId = (typeof RATE_LIMIT_PRESET_IDS)[number];

export type RateLimitPresetConfig = {
  id: RateLimitPresetId;
  max: number;
  windowSeconds: number;
};

export const RATE_LIMIT_PRESETS: Record<
  RateLimitPresetId,
  RateLimitPresetConfig
> = {
  register: { id: "register", max: 5, windowSeconds: 60 },
  auth: { id: "auth", max: 10, windowSeconds: 60 },
  integrationAuth: { id: "integrationAuth", max: 3, windowSeconds: 60 },
  authenticatedMutation: {
    id: "authenticatedMutation",
    max: 30,
    windowSeconds: 60,
  },
  bulkOperation: { id: "bulkOperation", max: 5, windowSeconds: 60 },
  queueEnqueue: { id: "queueEnqueue", max: 10, windowSeconds: 60 },
};
