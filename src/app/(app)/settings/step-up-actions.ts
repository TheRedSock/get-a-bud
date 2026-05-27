"use server";

import { z } from "zod";

import {
  authenticatedAction,
  validateActionInput,
} from "@/lib/actions/safe-action";
import { issueStepUpCookie, verifyUserPassword } from "@/lib/auth/step-up";
import { validationError } from "@/lib/errors/catalog";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const confirmStepUpSchema = z.object({
  password: z.string().min(8),
});

export const confirmStepUp = authenticatedAction(
  "auth.stepUp.confirm",
  async (ctx, input: unknown) => {
    await enforceRateLimit("authenticatedMutation", { userId: ctx.user.id });

    const validated = validateActionInput(
      confirmStepUpSchema,
      input,
      "Enter your current password to continue.",
    );
    if (validated.error) {
      throw validationError(validated.error.message, {
        fieldErrors: validated.error.fieldErrors,
      });
    }

    await verifyUserPassword(ctx.user.id, validated.data.password);
    await issueStepUpCookie(ctx.user.id);

    return { ok: true as const };
  },
);
