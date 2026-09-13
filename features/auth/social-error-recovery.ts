const VERIFICATION_RECOVERABLE_SOCIAL_ERROR = "account_not_linked";

export function verificationRecoveryForSocialError(error: string | string[] | undefined): string | null {
  return error === VERIFICATION_RECOVERABLE_SOCIAL_ERROR ? "/auth/verify-email" : null;
}
