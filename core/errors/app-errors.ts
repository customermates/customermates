const APP_ERROR_BRAND = Symbol.for("customermates.appError");
const UNMAPPABLE_WEBHOOK_PAYLOAD_BRAND = Symbol.for("customermates.unmappableWebhookPayload");

export enum AppErrorCode {
  unauthenticated = "unauthenticated",
  inactiveUser = "inactiveUser",
  permissionDenied = "permissionDenied",
  demoMode = "demoMode",
  invalidJsonBody = "invalidJsonBody",
}

type ForbiddenAppErrorCode = AppErrorCode.inactiveUser | AppErrorCode.permissionDenied;

const APP_ERROR_STATUS: Record<AppErrorCode, 400 | 401 | 403> = {
  [AppErrorCode.unauthenticated]: 401,
  [AppErrorCode.inactiveUser]: 403,
  [AppErrorCode.permissionDenied]: 403,
  [AppErrorCode.demoMode]: 403,
  [AppErrorCode.invalidJsonBody]: 400,
};

function hasBrand(value: unknown, brand: symbol): boolean {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true;
}

class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: AppErrorCode,
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
    super(message, 401, AppErrorCode.unauthenticated);
  }

  static [Symbol.hasInstance](value: unknown): value is AuthError {
    return appErrorDetails(value)?.code === AppErrorCode.unauthenticated;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not authorized", code: ForbiddenAppErrorCode = AppErrorCode.permissionDenied) {
    super(message, 403, code);
  }

  static [Symbol.hasInstance](value: unknown): value is ForbiddenError {
    const code = appErrorDetails(value)?.code;
    return code === AppErrorCode.inactiveUser || code === AppErrorCode.permissionDenied;
  }
}

export class InvalidJsonBodyError extends AppError {
  constructor() {
    super("Invalid JSON body", 400, AppErrorCode.invalidJsonBody);
  }
}

export const DEMO_MODE_MESSAGE = "This action is not available in demo mode. Please sign in to access all features.";

export class DemoModeError extends AppError {
  constructor() {
    super(DEMO_MODE_MESSAGE, 403, AppErrorCode.demoMode);
  }

  static [Symbol.hasInstance](value: unknown): value is DemoModeError {
    return appErrorDetails(value)?.code === AppErrorCode.demoMode;
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
  if (appErrorDetails(err)) return true;

  const message = (err as { message?: unknown } | null | undefined)?.message;
  if (typeof message !== "string") return false;

  return message.includes(WEBHOOK_FAILURE_MESSAGE_PREFIX) || message.startsWith(DEMO_MODE_MESSAGE);
}

const ERROR_CAUSE_DEPTH_LIMIT = 8;

function errorCause(error: unknown): unknown {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;

  try {
    return (error as { cause?: unknown }).cause;
  } catch {
    return undefined;
  }
}

function findInErrorCauseChain<T>(error: unknown, find: (candidate: unknown) => T | null): T | null {
  const seen = new Set<unknown>();
  let candidate = error;

  for (let depth = 0; depth <= ERROR_CAUSE_DEPTH_LIMIT; depth += 1) {
    if (seen.has(candidate)) return null;
    seen.add(candidate);

    const found = find(candidate);
    if (found !== null) return found;

    candidate = errorCause(candidate);
    if (candidate === undefined) return null;
  }

  return null;
}

function legacyAppErrorCode(err: { name?: unknown; message?: unknown; statusCode?: unknown }): AppErrorCode | null {
  if (err.name === "AuthError" || err.statusCode === 401) return AppErrorCode.unauthenticated;
  if (err.name === "DemoModeError" || err.message === DEMO_MODE_MESSAGE) return AppErrorCode.demoMode;
  if (err.name === "ForbiddenError" || err.statusCode === 403) return AppErrorCode.permissionDenied;
  return null;
}

export function appErrorDetails(err: unknown): { code: AppErrorCode; message: string; statusCode: number } | null {
  if (!(err instanceof AppError)) return null;

  const { code, message, statusCode } = err as {
    code?: unknown;
    message?: unknown;
    statusCode?: unknown;
  };
  if (typeof message !== "string" || typeof statusCode !== "number") return null;

  const stableCode = Object.values(AppErrorCode).includes(code as AppErrorCode)
    ? (code as AppErrorCode)
    : legacyAppErrorCode(err as { name?: unknown; message?: unknown; statusCode?: unknown });
  if (!stableCode) return null;

  const expectedStatus = APP_ERROR_STATUS[stableCode];
  if (statusCode !== expectedStatus) return null;

  return { code: stableCode, message, statusCode };
}

export function appErrorDetailsInCauseChain(
  error: unknown,
): { code: AppErrorCode; message: string; statusCode: number } | null {
  return findInErrorCauseChain(error, appErrorDetails);
}

export function appErrorResponse(err: unknown): { message: string; statusCode: number } | null {
  const details = appErrorDetails(err);
  if (!details) return null;

  return { message: details.message, statusCode: details.statusCode };
}
