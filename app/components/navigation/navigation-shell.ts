import type { AccountState } from "@/features/auth/account-state";

import { isRestrictedAccountState } from "@/features/auth/account-state";

type NavigationShell = "bare" | "public" | "restricted" | "app";

export function isPublicLinkPathname(pathname: string): boolean {
  return pathname.startsWith("/p/");
}

export function resolveNavigationShell({
  accountState,
  pathname,
  isRegistered,
}: {
  accountState: AccountState;
  pathname: string;
  isRegistered: boolean;
}): NavigationShell {
  if (isPublicLinkPathname(pathname)) return "bare";
  if (isRegistered && isRestrictedAccountState(accountState)) return "restricted";
  if (!isRegistered) return "public";
  if (accountState === "unauthenticated" || accountState === "unregistered") return "public";
  if (pathname.startsWith("/auth/") || pathname === "/onboarding" || pathname.startsWith("/onboarding/"))
    return "public";

  return "app";
}
