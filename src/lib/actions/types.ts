/**
 * Typed result shape for all Server Actions.
 *
 * Actions never throw to the client. They return either a data payload
 * or a structured error object suitable for toast display or field-level
 * validation feedback.
 */
export type ActionResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: ActionError };

export type ActionError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
};
