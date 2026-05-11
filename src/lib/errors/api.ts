import { NextResponse } from "next/server";
import type { z } from "zod";

import { AppError, isAppError } from "@/lib/errors/app-error";
import { unexpectedError, validationError } from "@/lib/errors/catalog";
import { logger } from "@/lib/logger";

type HandlerContext = Record<string, unknown>;

type ApiHandler<Context extends HandlerContext> = (
  request: Request,
  context: Context,
  meta: { requestId: string },
) => Response | Promise<Response>;

export type ApiErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    requestId: string;
  };
};

export function requestIdFrom(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function errorEnvelope(error: AppError, requestId: string): ApiErrorEnvelope {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.userMessage,
      fieldErrors: error.fieldErrors,
      requestId,
    },
  };
}

export function errorResponse(error: AppError, requestId: string) {
  return NextResponse.json(errorEnvelope(error, requestId), {
    status: error.status,
    headers: { "x-request-id": requestId },
  });
}

export function normalizeError(error: unknown, context?: Record<string, unknown>) {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error && error.message === "Authentication required") {
    return new AppError({
      code: "authentication_required",
      message: error.message,
      status: 401,
      userMessage: "Please sign in to continue.",
      logLevel: "silent",
      expected: true,
      cause: error,
    });
  }

  return unexpectedError(error, context);
}

export function withApiHandler<Context extends HandlerContext = HandlerContext>(
  operation: string,
  handler: ApiHandler<Context>,
) {
  return async (request: Request, context: Context) => {
    const requestId = requestIdFrom(request);

    try {
      const response = await handler(request, context, { requestId });
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      const appError = normalizeError(error, { operation });
      logger.exception(appError, { operation, requestId });
      return errorResponse(appError, requestId);
    }
  };
}

export async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch (error) {
    throw validationError("Request body must be valid JSON.", {
      context: { contentType: request.headers.get("content-type") },
      fieldErrors: { form: ["Request body must be valid JSON."] },
    });
  }
}

export async function validateJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  message: string,
): Promise<z.infer<TSchema>> {
  const body = await parseJsonBody(request);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw validationError(message, { zodError: parsed.error });
  }

  return parsed.data;
}
