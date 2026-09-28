import type { AccountState } from "@/features/auth/account-state";

import { isRestrictedAccountState } from "@/features/auth/account-state";

type NavigationShell = "public" | "restricted" | "app";

export function resolveNavigationShell({
  accountState,
  pathname,
  isRegistered,
}: {
  accountState: AccountState;
  pathname: string;
  isRegistered: boolean;
}): NavigationShell {
  if (isRegistered && isRestrictedAccountState(accountState)) return "restricted";
  if (!isRegistered) return "public";
  if (accountState === "unauthenticated" || accountState === "unregistered") return "public";
  if (pathname.startsWith("/auth/") || pathname === "/onboarding" || pathname.startsWith("/onboarding/"))
    return "public";

  return "app";
}
