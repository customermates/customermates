export const ACCOUNT_STATES = [
  "unauthenticated",
  "overdueVerification",
  "unregistered",
  "inactive",
  "pending",
  "onboarding",
  "legal",
  "subscription",
  "allowed",
] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

const ACCOUNT_STATE_REDIRECTS: Record<AccountState, string | null> = {
  unauthenticated: "/auth/signin",
  overdueVerification: "/auth/verify-email",
  unregistered: "/onboarding/wizard",
  inactive: "/auth/error?type=inactiveUser",
  pending: "/auth/pending",
  onboarding: "/onboarding/wizard",
  legal: "/legal-update",
  subscription: "/subscription-expired",
  allowed: null,
};

const RESTRICTED_ACCOUNT_STATES = new Set<AccountState>([
  "overdueVerification",
  "inactive",
  "pending",
  "onboarding",
  "legal",
  "subscription",
]);

export function accountStateRedirect(state: AccountState): string | null {
  return ACCOUNT_STATE_REDIRECTS[state];
}

export function isRestrictedAccountState(state: AccountState): boolean {
  return RESTRICTED_ACCOUNT_STATES.has(state);
}

export function isCanonicalInactiveErrorType(type: string | readonly string[] | undefined): boolean {
  if (typeof type === "string") return type === "inactiveUser";
  return type?.length === 1 && type[0] === "inactiveUser";
}
