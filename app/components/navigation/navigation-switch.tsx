"use client";

import type { TenantUser } from "@/features/user/user.schema";
import type { Company } from "@/generated/prisma";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";
import type { AccountState } from "@/features/auth/account-state";
import type { AccountMenuUser } from "./nav-user";

import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

import { AppSidebar } from "../app-sidebar";
import { AppTopBar } from "../app-topbar";
import { PublicNavbar } from "../public-navbar";
import { ShellHeader } from "../shell-header";
import { TopBarActionsProvider } from "../topbar-actions-context";

import { accountStateRedirect, isCanonicalInactiveErrorType } from "@/features/auth/account-state";
import { usePathname, useRouter } from "@/i18n/navigation";
import { DocsSidebar } from "@/app/[locale]/(static)/docs/components/docs-sidebar";
import { DocsTopBar } from "@/app/[locale]/(static)/docs/components/docs-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppLocalePreferenceSync } from "@/components/shared/app-locale-preference-sync";

import { ProtectedEnhancementsProvider } from "./protected-enhancements-context";
import { accountStateForPath } from "./account-state-for-path";
import { refreshAccountStateWhenVisible } from "./account-state-refresh";
import { resolveNavigationShell } from "./navigation-shell";

type Props = {
  accountState: AccountState;
  accountMenuUser: AccountMenuUser | null;
  appUser: TenantUser | null;
  userDisplayLanguage: unknown;
  hasValidSession: boolean;
  isRegistered: boolean;
  onboardingComplete: boolean;
  company: Company | null;
  terminology: EntityTerminologyOverride[];
  subscription: SubscriptionDto | null;
  trialDaysLeft: number | null;
  systemTaskCount: number;
  unreadThreadCount: number;
  channelsNeedingActionCount: number;
  emailVerified: boolean | null;
  defaultSidebarOpen?: boolean;
  legalStatus: LegalUpdateStatus | null;
  children: React.ReactNode;
};

export function NavigationSwitch({
  accountState,
  accountMenuUser,
  appUser,
  userDisplayLanguage,
  hasValidSession,
  isRegistered,
  onboardingComplete,
  company,
  terminology,
  subscription,
  trialDaysLeft,
  systemTaskCount,
  unreadThreadCount,
  channelsNeedingActionCount,
  emailVerified,
  defaultSidebarOpen = true,
  legalStatus,
  children,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorTypes = searchParams.getAll("type");
  const currentAccountState = accountStateForPath({
    accountState,
    pathname,
    isRegistered,
    isInactiveError: isCanonicalInactiveErrorType(errorTypes),
  });
  const shellMode = resolveNavigationShell({
    accountState: currentAccountState,
    pathname,
    isRegistered,
  });
  const rootStore = useRootStore();
  const { userStore, companyStore, subscriptionStore, terminologyStore } = rootStore;
  const accountAllowed = currentAccountState === "allowed";
  const protectedEnhancementsAllowed = accountAllowed && shellMode === "app";

  useEffect(() => {
    if (currentAccountState !== accountState) router.refresh();
  }, [accountState, currentAccountState, router]);

  useEffect(() => refreshAccountStateWhenVisible(() => router.refresh()), [router]);

  useLayoutEffect(() => {
    userStore.setUser(accountAllowed ? appUser : null);
    companyStore.setCompany(accountAllowed ? company : null);
    terminologyStore.setOverrides(accountAllowed ? terminology : []);
    subscriptionStore.setSubscription(accountAllowed ? subscription : null);

    if (!protectedEnhancementsAllowed) rootStore.closeAllModals();
  }, [accountAllowed, appUser, company, protectedEnhancementsAllowed, rootStore, subscription, terminology]);

  let shell: React.ReactNode;
  if (shellMode === "docs") {
    shell = (
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <DocsSidebar />

        <SidebarInset className="min-w-0 overflow-y-auto overflow-x-clip">
          <DocsTopBar />

          {children}
        </SidebarInset>
      </SidebarProvider>
    );
  } else if (shellMode === "public") {
    shell = (
      <div className="h-svh flex">
        <main className="flex flex-col relative flex-1 overflow-y-auto bg-background min-w-0">
          <header className="sticky top-0 z-30 bg-background/80 backdrop-blur flex flex-col">
            <PublicNavbar
              accountState={currentAccountState}
              hasValidSession={hasValidSession}
              isRegistered={isRegistered}
              onboardingComplete={onboardingComplete}
            />
          </header>

          <div className="flex flex-col flex-1 overflow-x-clip">{children}</div>
        </main>
      </div>
    );
  } else if (shellMode === "restricted") {
    shell = (
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar
          homeHref={accountStateRedirect(currentAccountState) ?? "/"}
          mode="restricted"
          user={accountMenuUser}
        />

        <SidebarInset className="min-w-0 overflow-x-clip">
          <ShellHeader />

          <div className="flex flex-1 flex-col min-w-0 overflow-y-auto overflow-x-clip">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    );
  } else {
    shell = (
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar
          channelsNeedingActionCount={channelsNeedingActionCount}
          emailVerified={emailVerified}
          legalStatus={legalStatus}
          mode="full"
          subscription={subscription}
          systemTaskCount={systemTaskCount}
          trialDaysLeft={trialDaysLeft}
          unreadThreadCount={unreadThreadCount}
          user={appUser}
        />

        <SidebarInset className="min-w-0 overflow-x-clip">
          <TopBarActionsProvider>
            <AppTopBar />

            <div className="flex flex-1 flex-col min-w-0 overflow-y-auto overflow-x-clip">{children}</div>
          </TopBarActionsProvider>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <ProtectedEnhancementsProvider allowed={protectedEnhancementsAllowed}>
      <AppLocalePreferenceSync displayLanguage={userDisplayLanguage} />

      {shell}
    </ProtectedEnhancementsProvider>
  );
}
