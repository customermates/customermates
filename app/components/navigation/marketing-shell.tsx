"use client";

import type { AccountState } from "@/features/auth/account-state";
import type { AppMode } from "@/core/config/environment";

import dynamic from "next/dynamic";

import { PublicScrollport } from "./public-scrollport";
import { useMarketingAccountState } from "./use-marketing-account-state";
import { useOnboardingIntentFromLocation } from "./use-onboarding-intent-from-location";

import { usePathname } from "@/i18n/navigation";

const DocsShell = dynamic(() => import("./docs-shell").then((mod) => ({ default: mod.DocsShell })));

type Props = {
  accountState?: AccountState;
  appMode: AppMode;
  children: React.ReactNode;
};

export function MarketingShell({ accountState: knownAccountState, appMode, children }: Props) {
  const pathname = usePathname();
  const isDocs = pathname === "/docs" || pathname.startsWith("/docs/");
  const { accountState, markSignedOut } = useMarketingAccountState(knownAccountState, !isDocs, pathname);
  const onboardingIntent = useOnboardingIntentFromLocation(pathname);

  if (isDocs) return <DocsShell appMode={appMode}>{children}</DocsShell>;

  return (
    <PublicScrollport
      accountState={accountState}
      appMode={appMode}
      hasValidSession={accountState !== "unauthenticated"}
      onboardingIntent={onboardingIntent}
      onSignedOut={markSignedOut}
    >
      {children}
    </PublicScrollport>
  );
}
