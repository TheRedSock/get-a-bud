import { createEnableBankingJwt } from "@/lib/ingestion/enable-banking/jwt";
import {
  toEnableBankingPsuHeaders,
  type PsuHeaders,
} from "@/lib/ingestion/enable-banking/psu-headers";
import { providerError } from "@/lib/errors/catalog";

type EnableBankingClientOptions = {
  applicationId: string;
  pemPrivateKey: string;
  baseUrl?: string;
};

type EnableBankingAccount = {
  account_id?: string | { iban?: string; other?: unknown };
  uid?: string;
  id?: string;
  name?: string;
  details?: string;
  currency?: string;
  account_servicer?: {
    name?: string;
  };
  cash_account_type?: string;
  identification_hash?: string;
  balance?: {
    amount?: string;
    currency?: string;
  };
};

type EnableBankingSession = {
  access?: {
    valid_until?: string;
  };
  accounts?: string[];
  accounts_data?: EnableBankingAccount[];
  aspsp?: {
    name?: string;
    country?: string;
  };
  authorized?: string;
  status?: string;
};

type EnableBankingTransaction = {
  entry_reference?: string;
  transaction_id?: string;
  uid?: string;
  amount?: {
    amount?: string;
    currency?: string;
  };
  booking_date?: string;
  value_date?: string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
  merchant?: { name?: string };
};

export class EnableBankingRateLimitError extends Error {
  retryAt?: Date;

  constructor(retryAt?: Date) {
    super("Enable Banking rate limit exceeded");
    this.name = "EnableBankingRateLimitError";
    this.retryAt = retryAt;
  }
}

export class EnableBankingClient {
  private readonly baseUrl: string;
  private readonly applicationId: string;
  private readonly pemPrivateKey: string;

  constructor(options: EnableBankingClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.enablebanking.com";
    this.applicationId = options.applicationId;
    this.pemPrivateKey = options.pemPrivateKey;
  }

  async listAspsps(filters?: {
    country?: string;
    psuType?: string;
    service?: string;
  }) {
    const params = new URLSearchParams();

    if (filters?.country) params.set("country", filters.country);
    if (filters?.psuType) params.set("psu_type", filters.psuType);
    if (filters?.service) params.set("service", filters.service);

    return this.request<{ aspsps?: Array<Record<string, unknown>> }>(
      `/aspsps${params.size ? `?${params}` : ""}`,
    );
  }

  async startAuthorization(input: {
    access: {
      validUntil: string;
      balances?: boolean;
      transactions?: boolean;
    };
    aspsp: {
      name: string;
      country: string;
    };
    state: string;
    redirectUrl: string;
    psuType?: "personal" | "business";
    authMethod?: string;
    credentials?: Record<string, string>;
    language?: string;
    psuId?: string;
    psuHeaders?: PsuHeaders;
  }) {
    return this.request<{
      url: string;
      authorization_id: string;
      psu_id_hash?: string;
    }>("/auth", {
      method: "POST",
      body: {
        access: {
          valid_until: input.access.validUntil,
          balances: input.access.balances ?? true,
          transactions: input.access.transactions ?? true,
        },
        aspsp: input.aspsp,
        state: input.state,
        redirect_url: input.redirectUrl,
        ...(input.psuType ? { psu_type: input.psuType } : {}),
        ...(input.authMethod ? { auth_method: input.authMethod } : {}),
        ...(input.credentials ? { credentials: input.credentials } : {}),
        ...(input.language ? { language: input.language } : {}),
        ...(input.psuId ? { psu_id: input.psuId } : {}),
      },
      psuHeaders: input.psuHeaders,
    });
  }

  async authorizeSession(code: string) {
    return this.request<{
      session_id: string;
      accounts?: EnableBankingAccount[];
      access?: {
        valid_until?: string;
      };
      aspsp?: {
        name?: string;
        country?: string;
      };
      psu_type?: string;
    }>("/sessions", {
      method: "POST",
      body: { code },
    });
  }

  async getSession(sessionId: string, psuHeaders?: PsuHeaders) {
    return this.request<EnableBankingSession>(
      `/sessions/${encodeURIComponent(sessionId)}`,
      { psuHeaders },
    );
  }

  async getAccountDetails(accountId: string, psuHeaders?: PsuHeaders) {
    return this.request<EnableBankingAccount>(
      `/accounts/${encodeURIComponent(accountId)}/details`,
      { psuHeaders },
    );
  }

  async getAccountBalances(accountId: string, psuHeaders?: PsuHeaders) {
    return this.request<{
      balances?: Array<{
        balance_amount?: {
          amount?: string;
          currency?: string;
        };
        amount?: {
          amount?: string;
          currency?: string;
        };
      }>;
    }>(`/accounts/${encodeURIComponent(accountId)}/balances`, { psuHeaders });
  }

  async getTransactions(input: {
    accountId: string;
    dateFrom: string;
    dateTo: string;
    continuationKey?: string;
    psuHeaders?: PsuHeaders;
  }) {
    const params = new URLSearchParams({
      date_from: input.dateFrom,
      date_to: input.dateTo,
    });

    if (input.continuationKey) {
      params.set("continuation_key", input.continuationKey);
    }

    return this.request<{
      transactions?: EnableBankingTransaction[];
      continuation_key?: string;
    }>(`/accounts/${encodeURIComponent(input.accountId)}/transactions?${params}`, {
      psuHeaders: input.psuHeaders,
    });
  }

  private async request<T>(
    path: string,
    options?: {
      method?: "GET" | "POST" | "DELETE";
      body?: Record<string, unknown>;
      psuHeaders?: PsuHeaders;
    },
  ): Promise<T> {
    const jwt = await createEnableBankingJwt({
      applicationId: this.applicationId,
      pemPrivateKey: this.pemPrivateKey,
    });

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...toEnableBankingPsuHeaders(options?.psuHeaders),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const retryAt = retryAfter
        ? new Date(Date.now() + Number(retryAfter) * 1000)
        : undefined;
      throw new EnableBankingRateLimitError(retryAt);
    }

    if (!response.ok) {
      const message = await response.text();
      throw providerError(
        `Enable Banking request failed: ${response.status} ${message}`,
        {
          status: response.status >= 500 ? 502 : 400,
          userMessage:
            "Enable Banking rejected the request. Check the bank details and try again.",
          context: {
            provider: "enable_banking",
            path,
            status: response.status,
            responseBody: message,
          },
        },
      );
    }

    return response.json() as Promise<T>;
  }
}

export function mapEnableBankingAccount(account: EnableBankingAccount) {
  const providerAccountId =
    (typeof account.account_id === "string" ? account.account_id : undefined) ??
    account.uid ??
    account.id;

  if (!providerAccountId) {
    throw providerError("Enable Banking account is missing an id", {
      context: { provider: "enable_banking", payload: account },
    });
  }

  return {
    providerAccountId,
    name: account.name ?? account.details ?? "Enable Banking account",
    currency: account.balance?.currency ?? account.currency ?? "NOK",
    balance: account.balance?.amount ?? "0",
    kind: "checking" as const,
    raw: account as Record<string, unknown>,
  };
}

export function mapEnableBankingTransaction(
  transaction: EnableBankingTransaction,
  providerAccountId: string,
) {
  const providerTransactionId =
    transaction.entry_reference ?? transaction.transaction_id ?? transaction.uid;

  if (!providerTransactionId) {
    throw providerError("Enable Banking transaction is missing an id", {
      context: { provider: "enable_banking", payload: transaction },
    });
  }

  const description =
    transaction.remittance_information?.join(" ") ??
    transaction.merchant?.name ??
    transaction.creditor?.name ??
    transaction.debtor?.name ??
    "Imported transaction";

  return {
    providerTransactionId,
    providerAccountId,
    amount: transaction.amount?.amount ?? "0",
    currency: transaction.amount?.currency ?? "NOK",
    date:
      transaction.booking_date ??
      transaction.value_date ??
      new Date().toISOString().slice(0, 10),
    merchantName: transaction.merchant?.name ?? transaction.creditor?.name,
    description,
    raw: transaction as Record<string, unknown>,
  };
}
