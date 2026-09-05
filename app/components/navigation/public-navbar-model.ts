import type { AccountState } from "@/features/auth/account-state";

import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

type PublicNavbarCta = {
  href: string;
  label: "signIn" | "openApp" | "continueSetup";
};

type PublicNavbarActions = {
  cta: PublicNavbarCta | null;
  showContact: boolean;
  signOut: "hidden" | "default" | "setupEscape";
};

export function resolvePublicNavbarActions({
  accountState,
  hasValidSession,
  onboardingIntent,
  pathname,
}: {
  accountState: AccountState;
  hasValidSession: boolean;
  onboardingIntent?: string;
  pathname: string;
}): PublicNavbarActions {
  if (!hasValidSession) {
    return {
      cta:
        pathname === "/auth/signin"
          ? null
          : {
              href: onboardingIntent ? pathWithOnboardingIntent("/auth/signin", onboardingIntent) : "/auth/signin",
              label: "signIn",
            },
      showContact: true,
      signOut: "hidden",
    };
  }

  if (accountState === "unregistered") {
    const onboardingPath = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

    return {
      cta: onboardingPath
        ? null
        : {
            href: onboardingIntent ? pathWithOnboardingIntent("/onboarding", onboardingIntent) : "/onboarding",
            label: "continueSetup",
          },
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
