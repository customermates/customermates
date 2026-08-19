const APP_ERROR_BRAND = Symbol.for("customermates.appError");
const UNMAPPABLE_WEBHOOK_PAYLOAD_BRAND = Symbol.for("customermates.unmappableWebhookPayload");

function hasBrand(value: unknown, brand: symbol): boolean {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true;
}

class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = this.constructor.name;
    (this as Record<symbol, unknown>)[APP_ERROR_BRAND] = true;
  }

  static [Symbol.hasInstance](value: unknown): value is AppError {
    return hasBrand(value, APP_ERROR_BRAND);
  }
}

export class AuthError extends AppError {
  constructor(message = "Not authenticated") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not authorized") {
    super(message, 403);
  }
}

export const DEMO_MODE_MESSAGE = "This action is not available in demo mode. Please sign in to access all features.";

export class DemoModeError extends AppError {
  constructor() {
    super(DEMO_MODE_MESSAGE, 403);
  }
}

export class AgentLimitExceededError extends AppError {
  constructor(message = "Your AI usage limit is reached.") {
    super(message, 429);
  }
}

export class AgentSessionUnavailableError extends AppError {
  constructor(message = "The assistant session could not be started. Please try again.") {
    super(message, 503);
  }
}

const RETRY_HALTING_ERROR_NAME = "FatalError";
const WEBHOOK_FAILURE_MESSAGE_PREFIX = "Webhook target responded";

export class WebhookExternalFailure extends Error {
  override name = "WebhookExternalFailure" as const;
  constructor(
    public readonly statusCode: number | null,
    public readonly responseMessage: string | null,
  ) {
    super(`${WEBHOOK_FAILURE_MESSAGE_PREFIX} ${statusCode ?? "no-status"} ${responseMessage ?? ""}`.trim());
  }
}

export class WebhookNonRetryableFailure extends Error {
  override name = RETRY_HALTING_ERROR_NAME;
  constructor(
    public readonly statusCode: number | null,
    public readonly responseMessage: string | null,
  ) {
    super(
      `${WEBHOOK_FAILURE_MESSAGE_PREFIX} ${statusCode ?? "no-status"} ${responseMessage ?? ""} (non-retryable)`.trim(),
    );
  }
}

export class UnmappableWebhookPayloadError extends Error {
  constructor(public readonly unipileMessageId: string | null) {
    super(
      `Unipile webhook payload could not be mapped to an ingestable item${unipileMessageId ? ` (${unipileMessageId})` : ""}`,
    );
    this.name = "UnmappableWebhookPayloadError";
    (this as Record<symbol, unknown>)[UNMAPPABLE_WEBHOOK_PAYLOAD_BRAND] = true;
  }

  static [Symbol.hasInstance](value: unknown): value is UnmappableWebhookPayloadError {
    return hasBrand(value, UNMAPPABLE_WEBHOOK_PAYLOAD_BRAND);
  }
}

export function isExpectedError(err: unknown): boolean {
  if (err instanceof AppError) return true;

  const message = (err as { message?: unknown } | null | undefined)?.message;
  if (typeof message !== "string") return false;

  return message.includes(WEBHOOK_FAILURE_MESSAGE_PREFIX) || message.startsWith(DEMO_MODE_MESSAGE);
}

export function appErrorResponse(err: unknown): { message: string; statusCode: number } | null {
  if (!(err instanceof AppError)) return null;

  const { message, statusCode } = err as { message?: unknown; statusCode?: unknown };
  if (typeof message !== "string" || typeof statusCode !== "number") return null;

  return { message, statusCode };
}
