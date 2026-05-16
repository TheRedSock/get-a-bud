import { NextResponse } from "next/server";

import { pingDatabase } from "@/db";

export async function GET() {
  const healthy = await pingDatabase();

  if (healthy) {
    return NextResponse.json(
      { ok: true, timestamp: new Date().toISOString() },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { ok: false, error: "Service unavailable" },
    { status: 503 },
  );
}
