import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serverEnv } from "@/config/env";
import { verifyPassword } from "@/lib/auth/password";
import { isAppError } from "@/lib/errors/app-error";
import { stepUpRequiredError, validationError } from "@/lib/errors/catalog";

export const STEP_UP_COOKIE = "gab-step-up";
export const STEP_UP_TTL_SECONDS = 15 * 60;

export function isStepUpFresh(verifiedAtMs: number): boolean {
  return Date.now() - verifiedAtMs < STEP_UP_TTL_SECONDS * 1000;
}

function stepUpSecret() {
  return new TextEncoder().encode(serverEnv.NEXTAUTH_SECRET);
}

export async function issueStepUpCookie(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STEP_UP_TTL_SECONDS}s`)
    .sign(stepUpSecret());

  const cookieStore = await cookies();
  cookieStore.set(STEP_UP_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STEP_UP_TTL_SECONDS,
  });
}

export async function requireStepUp(userId: string) {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(STEP_UP_COOKIE)?.value;

  if (!cookie) {
    throw stepUpRequiredError();
  }

  try {
    const { payload } = await jwtVerify(cookie, stepUpSecret());
    if (payload.sub !== userId) {
      throw stepUpRequiredError();
    }
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw stepUpRequiredError(
      "Your confirmation expired. Confirm your password again.",
    );
  }
}

export async function verifyUserPassword(userId: string, password: string) {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.passwordHash) {
    throw validationError(
      "Password confirmation is only available for email and password accounts.",
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw validationError("Incorrect password. Try again.");
  }

  return true;
}
