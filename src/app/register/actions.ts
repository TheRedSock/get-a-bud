"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { provisionNewHousehold } from "@/lib/auth/onboarding";
import { enforceActionRateLimit, registerRateLimit } from "@/lib/security/arcjet";
import type { ActionResult } from "@/lib/actions/types";
import { isAppError } from "@/lib/errors/app-error";

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  currency: z.string().length(3).default("NOK"),
});

export async function registerUser(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  try {
    await enforceActionRateLimit(registerRateLimit);

    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error: {
          code: "validation_error",
          message: "Please provide a valid name, email, password and currency.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
      };
    }
    const registerInput = parsed.data;

    const email = registerInput.email.toLowerCase();
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return {
        error: {
          code: "conflict",
          message: "An account already exists for that email.",
        },
      };
    }

    const passwordHash = await hashPassword(registerInput.password);

    await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({
          name: registerInput.name,
          email,
          passwordHash,
          defaultCurrency: registerInput.currency,
          onboardingComplete: true,
        })
        .returning();

      await provisionNewHousehold(tx, {
        userId: createdUser.id,
        name: registerInput.name,
        currency: registerInput.currency,
      });
    });

    return { data: { ok: true } };
  } catch (error) {
    if (isAppError(error)) {
      return {
        error: {
          code: error.code,
          message: error.userMessage,
          fieldErrors: error.fieldErrors,
        },
      };
    }

    // Let unexpected errors bubble to the framework error boundary
    throw error;
  }
}
