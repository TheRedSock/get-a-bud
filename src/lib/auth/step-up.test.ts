import { describe, expect, it } from "vitest";

import { isStepUpFresh, STEP_UP_TTL_SECONDS } from "./step-up";

describe("step-up TTL", () => {
  it("treats fresh verification as valid", () => {
    expect(isStepUpFresh(Date.now() - 1000)).toBe(true);
  });

  it("treats verification at the boundary as expired", () => {
    const exactlyAtTTL = Date.now() - STEP_UP_TTL_SECONDS * 1000;
    expect(isStepUpFresh(exactlyAtTTL)).toBe(false);
  });

  it("expires verification after the TTL window", () => {
    const expiredAt = Date.now() - (STEP_UP_TTL_SECONDS + 5) * 1000;
    expect(isStepUpFresh(expiredAt)).toBe(false);
  });

  it("treats a future timestamp as valid", () => {
    expect(isStepUpFresh(Date.now() + 5000)).toBe(true);
  });
});
