"use client";

import type { AccountState, MarketingAccountProfile } from "@/features/auth/account-state";

import { useLayoutEffect, useRef } from "react";

import { PublicNavbar } from "../public-navbar";

import { usePathname } from "@/i18n/navigation";

type Props = {
  accountState: AccountState;
  children: React.ReactNode;
  hasValidSession: boolean;
  onboardingIntent?: string;
  onSignedOut?: () => void;
  profile?: MarketingAccountProfile | null;
};

export function PublicScrollport({
  accountState,
  children,
  hasValidSession,
  onboardingIntent,
  onSignedOut,
  profile,
}: Props) {
  const pathname = usePathname();
  const scrollportRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollportRef.current) scrollportRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    <div
      ref={scrollportRef}
      data-public-scrollport
      className="relative flex h-svh flex-col overflow-y-auto bg-background [--table-sticky-top:4rem] [--toc-sticky-top:4rem] [--toc-anchor-offset:5rem] xl:[--table-sticky-top:3.5rem] xl:[--toc-sticky-top:3.5rem] xl:[--toc-anchor-offset:4.5rem]"
    >
      <header className="sticky top-0 z-50 flex shrink-0 flex-col bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
        <PublicNavbar
          accountState={accountState}
          hasValidSession={hasValidSession}
          onboardingIntent={onboardingIntent}
          profile={profile}
          onSignedOut={onSignedOut}
        />
      </header>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col flex-1 overflow-x-clip">{children}</div>
      </main>
    </div>
  );
}
