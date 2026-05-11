import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";
import { errorEnvelope, normalizeError, validateJsonBody } from "@/lib/errors/api";

describe("API error contract", () => {
  it("serializes only safe user-facing fields", () => {
    const error = new AppError({
      code: "provider_error",
      message: "Provider returned 500 with raw details",
      userMessage: "The bank service is unavailable. Please try again later.",
      status: 502,
      context: { providerBody: "secret detail" },
    });

    expect(errorEnvelope(error, "req_123")).toEqual({
      ok: false,
      error: {
        code: "provider_error",
        message: "The bank service is unavailable. Please try again later.",
        requestId: "req_123",
      },
    });
  });

  it("turns invalid JSON into a validation AppError", async () => {
    const request = new Request("http://test.local", {
      method: "POST",
      body: "{",
    });

    await expect(
      validateJsonBody(request, z.object({ name: z.string() }), "Invalid payload."),
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 400,
      userMessage: "Request body must be valid JSON.",
    });
  });

  it("maps unknown exceptions to an unexpected error", () => {
    expect(normalizeError(new Error("boom"), { operation: "test" })).toMatchObject({
      code: "unexpected_error",
      status: 500,
      userMessage: "Something unexpected happened. Please try again.",
    });
  });
});
