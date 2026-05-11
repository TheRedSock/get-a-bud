import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  budgetLines,
  budgets,
  categories,
  households,
  memberships,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { conflictError } from "@/lib/errors/catalog";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { defaultCategories } from "@/lib/finance/defaults";

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  currency: z.string().length(3).default("NOK"),
});

export const POST = withApiHandler("auth.register", async (request) => {
  const registerInput = await validateJsonBody(
    request,
    registerSchema,
    "Please provide a valid name, email, password and currency.",
  );
  const email = registerInput.email.toLowerCase();
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    throw conflictError("An account already exists for that email.", { email });
  }

  const passwordHash = await hashPassword(registerInput.password);

  const [createdUser] = await db
    .insert(users)
    .values({
      name: registerInput.name,
      email,
      passwordHash,
      defaultCurrency: registerInput.currency,
      onboardingComplete: true,
    })
    .returning();

  const [household] = await db
    .insert(households)
    .values({
      name: `${registerInput.name.split(" ")[0]}'s budget`,
      defaultCurrency: registerInput.currency,
      createdById: createdUser.id,
    })
    .returning();

  await db.insert(memberships).values({
    householdId: household.id,
    userId: createdUser.id,
    role: "owner",
  });

  const insertedCategories = await db
    .insert(categories)
    .values(
      defaultCategories.map((category) => ({
        householdId: household.id,
        ...category,
        isSystem: true,
      })),
    )
    .returning();

  const [budget] = await db
    .insert(budgets)
    .values({
      householdId: household.id,
      name: "Main budget",
      type: "monthly",
      currency: registerInput.currency,
    })
    .returning();

  await db.insert(budgetLines).values(
    insertedCategories
      .filter((category) => !category.isIncome)
      .map((category) => ({
        budgetId: budget.id,
        categoryId: category.id,
        allocatedAmount: "0",
      })),
  );

  return NextResponse.json({ ok: true });
});
