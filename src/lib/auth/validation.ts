import { z } from "zod";

import { currencySchema } from "@/lib/finance/validation";

export const signInFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const registerFormSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  currency: currencySchema.default("NOK"),
});
