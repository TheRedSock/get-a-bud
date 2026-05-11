import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { getActiveHousehold } from "@/lib/finance/household";
import { createCategorySchema } from "@/lib/finance/validation";

export async function GET() {
  const household = await getActiveHousehold();
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.householdId, household.householdId))
    .orderBy(asc(categories.name));

  return NextResponse.json({ categories: rows });
}

export async function POST(request: Request) {
  const household = await getActiveHousehold();
  const body = await request.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid category payload" }, { status: 400 });
  }

  const [category] = await db
    .insert(categories)
    .values({
      householdId: household.householdId,
      ...parsed.data,
      isSystem: false,
    })
    .returning();

  return NextResponse.json({ category }, { status: 201 });
}
