import type { ApiErrorEnvelope } from "@/lib/errors/api";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    fieldErrors?: Record<string, string[]>;
    requestId?: string;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.code = input.code;
    this.status = input.status;
    this.fieldErrors = input.fieldErrors;
    this.requestId = input.requestId;
  }
}

async function readJson(response: Response) {
  return (await response.json().catch(() => null)) as unknown;
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }

  const envelope = value as Partial<ApiErrorEnvelope>;
  return envelope.ok === false && typeof envelope.error?.message === "string";
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = await readJson(response);

  if (!response.ok) {
    if (isErrorEnvelope(body)) {
      throw new ApiClientError({
        code: body.error.code,
        message: body.error.message,
        status: response.status,
        fieldErrors: body.error.fieldErrors,
        requestId: body.error.requestId,
      });
    }

    const legacyError =
      body && typeof body === "object" && "error" in body
        ? String((body as { error?: unknown }).error)
        : "Something unexpected happened. Please try again.";

    throw new ApiClientError({
      code: "legacy_error",
      message: legacyError,
      status: response.status,
    });
  }

  return body as T;
}

export function messageFromError(
  error: unknown,
  fallback = "Something unexpected happened. Please try again.",
) {
  return error instanceof Error ? error.message : fallback;
}
