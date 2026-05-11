import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { households, memberships } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { forbiddenError, notFoundError } from "@/lib/errors/catalog";

export async function getActiveHousehold() {
  const user = await requireUser();

  const [membership] = await db
    .select({
      householdId: memberships.householdId,
      role: memberships.role,
      householdName: households.name,
      currency: households.defaultCurrency,
      theme: households.theme,
    })
    .from(memberships)
    .innerJoin(households, eq(households.id, memberships.householdId))
    .where(eq(memberships.userId, user.id))
    .limit(1);

  if (!membership) {
    throw notFoundError("No household found for your account.", {
      userId: user.id,
    });
  }

  return membership;
}

export async function assertHouseholdAccess(householdId: string) {
  const user = await requireUser();

  const [membership] = await db
    .select({ id: memberships.id, role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.householdId, householdId), eq(memberships.userId, user.id)),
    )
    .limit(1);

  if (!membership) {
    throw forbiddenError("You do not have access to this household.");
  }

  return membership;
}
