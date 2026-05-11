import { SignJWT, importPKCS8 } from "jose";

const ENABLE_BANKING_AUDIENCE = "api.enablebanking.com";
const ENABLE_BANKING_ISSUER = "enablebanking.com";

export async function createEnableBankingJwt(input: {
  applicationId: string;
  pemPrivateKey: string;
}) {
  const privateKey = await importPKCS8(input.pemPrivateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({
      typ: "JWT",
      alg: "RS256",
      kid: input.applicationId,
    })
    .setIssuer(ENABLE_BANKING_ISSUER)
    .setAudience(ENABLE_BANKING_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60)
    .sign(privateKey);
}
