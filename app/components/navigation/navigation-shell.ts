import type { AccountState } from "@/features/auth/account-state";

import { isRestrictedAccountState } from "@/features/auth/account-state";

export type NavigationShell = "docs" | "public" | "restricted" | "app";

export function resolveNavigationShell({
  accountState,
  pathname,
  isRegistered,
}: {
  accountState: AccountState;
  pathname: string;
  isRegistered: boolean;
}): NavigationShell {
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return "docs";
  if (!isRegistered) return "public";
  if (isRegistered && isRestrictedAccountState(accountState)) return "restricted";
  if (accountState === "unauthenticated" || accountState === "unregistered") return "public";
  if (pathname.startsWith("/auth/") || pathname === "/onboarding/wizard" || pathname.startsWith("/onboarding/wizard/"))
    return "public";

  return "app";
}
