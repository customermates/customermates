export class AppError extends Error {
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

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class WebhookExternalFailure extends Error {
  override name = "WebhookExternalFailure" as const;
  constructor(
    public readonly statusCode: number | null,
    public readonly responseMessage: string | null,
  ) {
    super(`Webhook target responded ${statusCode ?? "no-status"} ${responseMessage ?? ""}`.trim());
  }
}

export const EXPECTED_ERROR_NAMES: ReadonlySet<string> = new Set([
  "AppError",
  "AuthError",
  "ForbiddenError",
  "DemoModeError",
  "NotFoundError",
  "WebhookExternalFailure",
  "AbortTaskRunError",
]);

export function isExpectedError(err: unknown): boolean {
  return err instanceof Error && EXPECTED_ERROR_NAMES.has(err.name);
}
