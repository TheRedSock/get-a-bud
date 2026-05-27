import type { RateLimitPresetId } from "./presets";

export type RateLimitCheckInput = {
  presetId: RateLimitPresetId;
  identifier: string;
};

export type RateLimitProvider = {
  check(input: RateLimitCheckInput): Promise<{ allowed: boolean }>;
};
