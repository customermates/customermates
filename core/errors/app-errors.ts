class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = this.constructor.name;
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

export class DemoModeError extends AppError {
  constructor() {
    super("This action is not available in demo mode. Please sign in to access all features.", 403);
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

export function isExpectedError(err: unknown): boolean {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return err instanceof AppError || (typeof message === "string" && message.startsWith(WEBHOOK_FAILURE_MESSAGE_PREFIX));
}

export function appErrorResponse(err: unknown): { message: string; statusCode: number } | null {
  if (err instanceof AppError) return { message: err.message, statusCode: err.statusCode };

  return null;
}
