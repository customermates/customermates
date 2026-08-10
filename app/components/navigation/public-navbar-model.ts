import type { AccountState } from "@/features/auth/account-state";

export type PublicNavbarCta = {
  href: "/auth/signin" | "/dashboard" | "/onboarding/wizard";
  label: "signIn" | "openApp" | "continueSetup";
};

export function resolvePublicNavbarCta({
  accountState,
  hasValidSession,
  isRegistered,
  onboardingComplete,
}: {
  accountState: AccountState;
  hasValidSession: boolean;
  isRegistered: boolean;
  onboardingComplete: boolean;
}): PublicNavbarCta | null {
  if (!hasValidSession) return { href: "/auth/signin", label: "signIn" };
  if (accountState === "overdueVerification") return null;
  if (accountState === "unregistered") return { href: "/onboarding/wizard", label: "continueSetup" };
  if (accountState === "allowed" && isRegistered && onboardingComplete) return { href: "/dashboard", label: "openApp" };

  return null;
}
