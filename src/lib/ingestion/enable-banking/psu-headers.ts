export type PsuHeaders = {
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  accept?: string;
  acceptLanguage?: string;
};

export function capturePsuHeaders(headers: Headers): PsuHeaders {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return {
    ipAddress:
      headers.get("x-real-ip") ??
      forwardedFor ??
      headers.get("cf-connecting-ip") ??
      undefined,
    userAgent: headers.get("user-agent") ?? undefined,
    referer: headers.get("referer") ?? undefined,
    accept: headers.get("accept") ?? undefined,
    acceptLanguage: headers.get("accept-language") ?? undefined,
  };
}

export function toEnableBankingPsuHeaders(headers?: PsuHeaders) {
  if (!headers) {
    return {};
  }

  return {
    ...(headers.ipAddress ? { "Psu-Ip-Address": headers.ipAddress } : {}),
    ...(headers.userAgent ? { "Psu-User-Agent": headers.userAgent } : {}),
    ...(headers.referer ? { "Psu-Referer": headers.referer } : {}),
    ...(headers.accept ? { "Psu-Accept": headers.accept } : {}),
    ...(headers.acceptLanguage
      ? { "Psu-Accept-language": headers.acceptLanguage }
      : {}),
  };
}
