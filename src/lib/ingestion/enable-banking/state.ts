import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { publicEnv, serverEnv } from "@/config/env";

const STATE_TTL_MINUTES = 20;

function getStateSecret() {
  return serverEnv.NEXTAUTH_SECRET;
}

export function createAuthorizationState() {
  const state = randomBytes(32).toString("base64url");

  return {
    state,
    stateHash: hashAuthorizationState(state),
    expiresAt: new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000),
  };
}

export function hashAuthorizationState(state: string) {
  return createHmac("sha256", getStateSecret()).update(state).digest("base64url");
}

export function safeCompareStateHash(state: string, expectedHash: string) {
  const actual = Buffer.from(hashAuthorizationState(state));
  const expected = Buffer.from(expectedHash);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function getAppUrl(requestUrl?: string) {
  if (publicEnv.NEXT_PUBLIC_APP_URL) {
    return publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (requestUrl) {
    const url = new URL(requestUrl);
    return url.origin;
  }

  return serverEnv.NEXTAUTH_URL.replace(/\/$/, "");
}
