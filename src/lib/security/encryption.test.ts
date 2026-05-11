import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

const testKey = Buffer.alloc(32, 7).toString("base64");

describe("field encryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round trips encrypted secrets", () => {
    vi.stubEnv("FIELD_ENCRYPTION_KEY", testKey);

    const encrypted = encryptSecret("private value");

    expect(encrypted.ciphertext).not.toBe("private value");
    expect(decryptSecret(encrypted)).toBe("private value");
  });

  it("rejects invalid key lengths", () => {
    vi.stubEnv("FIELD_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));

    expect(() => encryptSecret("private value")).toThrow(
      "FIELD_ENCRYPTION_KEY must decode to 32 bytes",
    );
  });
});
