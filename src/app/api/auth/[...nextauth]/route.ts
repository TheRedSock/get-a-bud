import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { authOptions } from "@/lib/auth/options";
import { authRateLimit } from "@/lib/security/arcjet";
import { rateLimitedError } from "@/lib/errors/catalog";
import { errorResponse } from "@/lib/errors/api";

const handler = NextAuth(authOptions);

export const GET = handler;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const decision = await authRateLimit.protect(request);
  if (decision.isDenied()) {
    const error = rateLimitedError(
      "Too many sign-in attempts. Please try again later.",
    );
    return errorResponse(error, crypto.randomUUID());
  }

  return handler(request, context);
}
