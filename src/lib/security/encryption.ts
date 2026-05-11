import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function getKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error("FIELD_ENCRYPTION_KEY is required");
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to 32 bytes");
  }

  return key;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedPayload) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(payload.iv, "base64"),
  );

  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
