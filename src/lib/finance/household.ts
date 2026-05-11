import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { households, memberships } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

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
    throw new Error("No household found for current user");
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
    throw new Error("You do not have access to this household");
  }

  return membership;
}
