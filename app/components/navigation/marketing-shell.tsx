"use client";

import type { AccountState } from "@/features/auth/account-state";

import dynamic from "next/dynamic";

import { PublicScrollport } from "./public-scrollport";

import { usePathname } from "@/i18n/navigation";

const DocsShell = dynamic(() => import("./docs-shell").then((mod) => ({ default: mod.DocsShell })));

type Props = {
  accountState: AccountState;
  children: React.ReactNode;
};

export function MarketingShell({ accountState, children }: Props) {
  const pathname = usePathname();

  if (pathname === "/docs" || pathname.startsWith("/docs/")) return <DocsShell>{children}</DocsShell>;

  return (
    <PublicScrollport accountState={accountState} hasValidSession={accountState !== "unauthenticated"}>
      {children}
    </PublicScrollport>
  );
}
