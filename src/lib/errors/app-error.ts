export type ErrorLogLevel = "silent" | "info" | "warn" | "error";

export type FieldErrors = Record<string, string[]>;

type AppErrorOptions = {
  code: string;
  message: string;
  status?: number;
  userMessage?: string;
  logLevel?: ErrorLogLevel;
  expected?: boolean;
  fieldErrors?: FieldErrors;
  context?: Record<string, unknown>;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly userMessage: string;
  readonly logLevel: ErrorLogLevel;
  readonly expected: boolean;
  readonly fieldErrors?: FieldErrors;
  readonly context?: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.userMessage = options.userMessage ?? options.message;
    this.logLevel = options.logLevel ?? (this.status >= 500 ? "error" : "warn");
    this.expected = options.expected ?? this.status < 500;
    this.fieldErrors = options.fieldErrors;
    this.context = options.context;
    this.cause = options.cause;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
