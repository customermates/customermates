"use client";

import type { AccountState } from "@/features/auth/account-state";

import { useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import { PublicNavbar } from "../public-navbar";

import { usePathname } from "@/i18n/navigation";
import { ONBOARDING_INTENT_QUERY_PARAM } from "@/features/company/onboarding-intent-url";

const DocsShell = dynamic(() => import("./docs-shell").then((mod) => ({ default: mod.DocsShell })));

type Props = {
  accountState: AccountState;
  children: React.ReactNode;
  defaultSidebarOpen?: boolean;
};

export function MarketingShell({ accountState, children, defaultSidebarOpen = true }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollportRef = useRef<HTMLDivElement>(null);
  const isDocs = pathname === "/docs" || pathname.startsWith("/docs/");
  const onboardingIntents = searchParams.getAll(ONBOARDING_INTENT_QUERY_PARAM);
  const onboardingIntent = onboardingIntents.length === 1 && onboardingIntents[0] ? onboardingIntents[0] : undefined;

  useLayoutEffect(() => {
    if (isDocs || !scrollportRef.current) return;
    scrollportRef.current.scrollTop = 0;
  }, [isDocs, pathname]);

  if (isDocs) return <DocsShell defaultSidebarOpen={defaultSidebarOpen}>{children}</DocsShell>;

  return (
    <div
      ref={scrollportRef}
      data-public-scrollport
      className="relative flex h-svh flex-col overflow-y-auto bg-background [--table-sticky-top:4rem] [--toc-sticky-top:4rem] [--toc-anchor-offset:5rem] xl:[--table-sticky-top:3.5rem] xl:[--toc-sticky-top:3.5rem] xl:[--toc-anchor-offset:4.5rem]"
    >
      <header className="sticky top-0 z-50 flex shrink-0 flex-col bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
        <PublicNavbar
          accountState={accountState}
          hasValidSession={accountState !== "unauthenticated"}
          onboardingIntent={onboardingIntent}
        />
      </header>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col flex-1 overflow-x-clip">{children}</div>
      </main>
    </div>
  );
}
