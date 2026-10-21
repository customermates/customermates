import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";

const EMAIL_VERIFICATION_REQUIRED_BRAND = Symbol.for("customermates.emailVerificationRequired");

export const EMAIL_VERIFICATION_REQUIRED_MESSAGE =
  "Verify your email address to keep using this account. Sign in to the app and request a new verification link.";

export class EmailVerificationRequiredError extends ForbiddenError {
  constructor() {
    super(EMAIL_VERIFICATION_REQUIRED_MESSAGE, AppErrorCode.inactiveUser);
    (this as Record<symbol, unknown>)[EMAIL_VERIFICATION_REQUIRED_BRAND] = true;
  }

  static [Symbol.hasInstance](value: unknown): value is EmailVerificationRequiredError {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[EMAIL_VERIFICATION_REQUIRED_BRAND] === true
    );
  }
}
