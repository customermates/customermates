class AppError extends Error {
  readonly isAppError = true;

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

export const DEMO_MODE_MESSAGE = "This action is not available in demo mode. Please sign in to access all features.";

export class DemoModeError extends AppError {
  constructor() {
    super(DEMO_MODE_MESSAGE, 403);
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

function isAppErrorLike(err: unknown): boolean {
  return err instanceof AppError || (err as { isAppError?: unknown } | null | undefined)?.isAppError === true;
}

export function isExpectedError(err: unknown): boolean {
  if (isAppErrorLike(err)) return true;

  const message = (err as { message?: unknown } | null | undefined)?.message;
  if (typeof message !== "string") return false;

  return message.startsWith(WEBHOOK_FAILURE_MESSAGE_PREFIX) || message.startsWith(DEMO_MODE_MESSAGE);
}

export function appErrorResponse(err: unknown): { message: string; statusCode: number } | null {
  if (!isAppErrorLike(err)) return null;

  const { message, statusCode } = err as { message?: unknown; statusCode?: unknown };
  if (typeof message !== "string" || typeof statusCode !== "number") return null;

  return { message, statusCode };
}
