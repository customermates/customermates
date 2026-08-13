import type { AccountState } from "@/features/auth/account-state";

export type PublicNavbarCta = {
  href: "/auth/signin" | "/dashboard" | "/onboarding/wizard";
  label: "signIn" | "openApp" | "continueSetup";
};

export type PublicNavbarActions = {
  cta: PublicNavbarCta | null;
  showContact: boolean;
  signOut: "hidden" | "default" | "setupEscape";
};

function isOnboardingPath(pathname: string): boolean {
  return pathname === "/onboarding/wizard" || pathname.startsWith("/onboarding/wizard/");
}

export function resolvePublicNavbarActions({
  accountState,
  hasValidSession,
  pathname,
}: {
  accountState: AccountState;
  hasValidSession: boolean;
  pathname: string;
}): PublicNavbarActions {
  if (!hasValidSession) {
    return {
      cta: pathname === "/auth/signin" ? null : { href: "/auth/signin", label: "signIn" },
      showContact: true,
      signOut: "hidden",
    };
  }

  if (accountState === "unregistered") {
    const onboardingPath = isOnboardingPath(pathname);

    return {
      cta: onboardingPath ? null : { href: "/onboarding/wizard", label: "continueSetup" },
      showContact: false,
      signOut: onboardingPath ? "setupEscape" : "hidden",
    };
  }

  const cta: PublicNavbarCta | null =
    accountState === "allowed" && pathname !== "/dashboard" ? { href: "/dashboard", label: "openApp" } : null;

  return {
    cta,
    showContact: true,
    signOut: "default",
  };
}
