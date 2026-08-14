import type { AccountState } from "@/features/auth/account-state";

const UNAUTHENTICATED_ONLY_PATHS = new Set([
  "/auth/signin",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

export function accountStateForPath({
  accountState,
  pathname,
  isRegistered,
  isInactiveError,
}: {
  accountState: AccountState;
  pathname: string;
  isRegistered: boolean;
  isInactiveError: boolean;
}): AccountState {
  if (UNAUTHENTICATED_ONLY_PATHS.has(pathname) && accountState !== "unauthenticated" && accountState !== "unregistered")
    return "unauthenticated";
  if (pathname === "/auth/verify-email" && accountState !== "unauthenticated") return "overdueVerification";
  if (!isRegistered) return accountState;
  if (pathname === "/auth/pending") return "pending";
  if (pathname === "/auth/error" && isInactiveError) return "inactive";
  if (pathname === "/onboarding/wizard" || pathname.startsWith("/onboarding/wizard/")) return "onboarding";
  if (pathname === "/legal-update") return "legal";
  if (pathname === "/subscription-expired") return "subscription";

  return accountState;
}
