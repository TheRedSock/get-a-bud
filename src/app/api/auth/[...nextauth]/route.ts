import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { authOptions } from "@/lib/auth/options";
import { isAppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/api";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const handler = NextAuth(authOptions);

export const GET = handler;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  try {
    await enforceRateLimit("auth", {
      headers: request.headers,
      message: "Too many sign-in attempts. Please try again later.",
    });
  } catch (error) {
    if (isAppError(error) && error.code === "rate_limited") {
      return errorResponse(error, crypto.randomUUID());
    }
    throw error;
  }

  return handler(request, context);
}
