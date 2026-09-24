"use client";

import type { TenantUser } from "@/features/user/user.schema";
import type { Company } from "@/generated/prisma";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";
import type { AccountState } from "@/features/auth/account-state";
import type { SidebarUser } from "./sidebar-user";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { TopBarActionsProvider } from "../topbar-actions-context";

import { isCanonicalInactiveErrorType } from "@/features/auth/account-state";
import { usePathname, useRouter } from "@/i18n/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppLocalePreferenceSync } from "@/components/shared/app-locale-preference-sync";

import { ProtectedEnhancementsProvider } from "./protected-enhancements-context";
import { accountStateForPath } from "./account-state-for-path";
import { resolveNavigationShell } from "./navigation-shell";
import { PublicScrollport } from "./public-scrollport";

const AppSidebar = dynamic(() => import("../app-sidebar").then((mod) => ({ default: mod.AppSidebar })));
const AppTopBar = dynamic(() => import("../app-topbar").then((mod) => ({ default: mod.AppTopBar })));
const ShellHeader = dynamic(() => import("../shell-header").then((mod) => ({ default: mod.ShellHeader })));

type NavigationSwitchProps = {
  accountState: AccountState;
  sidebarUser: SidebarUser | null;
  appUser: TenantUser | null;
  userDisplayLanguage: unknown;
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
  operatorConsoleVisible: boolean;
  children: React.ReactNode;
};

export function NavigationSwitch({
  accountState,
  sidebarUser,
  appUser,
  userDisplayLanguage,
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
  operatorConsoleVisible,
  children,
}: NavigationSwitchProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorTypes = searchParams.getAll("type");
  const hasValidSession = accountState !== "unauthenticated";
  const isRegistered = sidebarUser !== null;
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
  const identifiedUser = accountAllowed ? appUser : null;

  useEffect(() => {
    if (currentAccountState !== accountState) router.refresh();
  }, [accountState, currentAccountState, router]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router]);

  useLayoutEffect(() => {
    Sentry.setUser(identifiedUser ? { id: identifiedUser.id } : null);
    Sentry.setTag("companyId", identifiedUser?.companyId);

    userStore.setUser(identifiedUser);
    companyStore.setCompany(accountAllowed ? company : null);
    terminologyStore.setOverrides(accountAllowed ? terminology : []);
    subscriptionStore.setSubscription(accountAllowed ? subscription : null);

    if (!protectedEnhancementsAllowed) rootStore.closeAllModals();
  }, [accountAllowed, company, identifiedUser, protectedEnhancementsAllowed, rootStore, subscription, terminology]);

  let shell: React.ReactNode;
  if (shellMode === "public") {
    shell = (
      <PublicScrollport accountState={currentAccountState} hasValidSession={hasValidSession}>
        {children}
      </PublicScrollport>
    );
  } else if (shellMode === "restricted") {
    shell = (
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        {sidebarUser ? <AppSidebar mode="restricted" user={sidebarUser} /> : null}

        <SidebarInset className="min-w-0 overflow-x-clip">
          <ShellHeader />

          <div className="flex flex-1 flex-col min-w-0 overflow-y-auto overflow-x-clip [--table-sticky-top:0px]">
            {children}
          </div>
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
          operatorConsoleVisible={operatorConsoleVisible}
          subscription={subscription}
          systemTaskCount={systemTaskCount}
          trialDaysLeft={trialDaysLeft}
          unreadThreadCount={unreadThreadCount}
          user={sidebarUser}
        />

        <SidebarInset className="min-w-0 overflow-x-clip">
          <TopBarActionsProvider>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto [--table-sticky-top:4rem] [&:has([data-joins-top-bar])>header]:border-b-0">
              <AppTopBar operatorConsoleVisible={operatorConsoleVisible} />

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
            </div>
          </TopBarActionsProvider>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <ProtectedEnhancementsProvider allowed={protectedEnhancementsAllowed}>
      {rootStore.appMode === "demo" ? null : <AppLocalePreferenceSync displayLanguage={userDisplayLanguage} />}

      {shell}
    </ProtectedEnhancementsProvider>
  );
}
