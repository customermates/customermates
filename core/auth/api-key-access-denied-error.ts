import { ForbiddenError } from "@/core/errors/app-errors";

const API_KEY_ACCESS_DENIED_BRAND = Symbol.for("customermates.apiKeyAccessDenied");

export const API_KEY_ACCESS_DENIED_MESSAGE =
  "Using API keys requires Read access All on API & Webhooks for your role. Ask a workspace administrator to grant it.";

export class ApiKeyAccessDeniedError extends ForbiddenError {
  constructor() {
    super(API_KEY_ACCESS_DENIED_MESSAGE);
    (this as Record<symbol, unknown>)[API_KEY_ACCESS_DENIED_BRAND] = true;
  }

  static [Symbol.hasInstance](value: unknown): value is ApiKeyAccessDeniedError {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[API_KEY_ACCESS_DENIED_BRAND] === true
    );
  }
}
