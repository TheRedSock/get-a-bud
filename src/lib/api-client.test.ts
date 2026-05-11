import { ApiClientError, parseApiResponse } from "@/lib/api-client";

describe("parseApiResponse", () => {
  it("returns successful JSON bodies", async () => {
    await expect(
      parseApiResponse<{ ok: true }>(
        Response.json({ ok: true }, { status: 201 }),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("throws typed client errors from the standard envelope", async () => {
    const response = Response.json(
      {
        ok: false,
        error: {
          code: "validation_failed",
          message: "Name is required.",
          fieldErrors: { name: ["Name is required."] },
          requestId: "req_123",
        },
      },
      { status: 400 },
    );

    await expect(parseApiResponse(response)).rejects.toMatchObject({
      code: "validation_failed",
      message: "Name is required.",
      status: 400,
      fieldErrors: { name: ["Name is required."] },
      requestId: "req_123",
    } satisfies Partial<ApiClientError>);
  });
});
