import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { validateJsonBody, withApiHandler } from "@/lib/errors/api";
import { getActiveHousehold } from "@/lib/finance/household";
import { createCategorySchema } from "@/lib/finance/validation";

export const GET = withApiHandler("categories.list", async () => {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.householdId, household.householdId))
    .orderBy(asc(categories.name));

  return NextResponse.json({ categories: rows });
});

export const POST = withApiHandler("categories.create", async (request) => {
  const household = await getActiveHousehold();
  const categoryInput = await validateJsonBody(
    request,
    createCategorySchema,
    "Please provide a valid category name.",
  );

  const [category] = await db
    .insert(categories)
    .values({
      householdId: household.householdId,
      ...categoryInput,
      isSystem: false,
    })
    .returning();

  return NextResponse.json({ category }, { status: 201 });
});
