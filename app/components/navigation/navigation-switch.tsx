"use client";

import type { TenantUser } from "@/features/user/user.schema";
import type { Company } from "@/generated/prisma";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";

import { useLayoutEffect } from "react";

import { AppSidebar } from "../app-sidebar";
import { AppTopBar } from "../app-topbar";
import { PublicNavbar } from "../public-navbar";
import { TopBarActionsProvider } from "../topbar-actions-context";

import { usePathname } from "@/i18n/navigation";
import { DocsSidebar } from "@/app/[locale]/(static)/docs/components/docs-sidebar";
import { DocsTopBar } from "@/app/[locale]/(static)/docs/components/docs-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppLocalePreferenceSync } from "@/components/shared/app-locale-preference-sync";

type Props = {
  isAuthenticated: boolean;
  onboardingComplete: boolean;
  company: Company | null;
  terminology: EntityTerminologyOverride[];
  subscription: SubscriptionDto | null;
  trialDaysLeft: number | null;
  systemTaskCount: number;
  unreadThreadCount: number;
  channelsNeedingActionCount: number;
  user: TenantUser | null;
  emailVerified: boolean | null;
  defaultSidebarOpen?: boolean;
  legalStatus: LegalUpdateStatus | null;
  children: React.ReactNode;
};

export function NavigationSwitch({
  isAuthenticated,
  onboardingComplete,
  company,
  terminology,
  subscription,
  trialDaysLeft,
  systemTaskCount,
  unreadThreadCount,
  channelsNeedingActionCount,
  user,
  emailVerified,
  defaultSidebarOpen = true,
  legalStatus,
  children,
}: Props) {
  const pathname = usePathname();
  const isDocsRoute = pathname === "/docs" || pathname.startsWith("/docs/");
  const isOnboardingWizard = pathname === "/onboarding/wizard" || pathname.startsWith("/onboarding/wizard/");
  const isAuthRoute = pathname.startsWith("/auth/");
  const hideAppShell = !isAuthenticated || isOnboardingWizard || isAuthRoute;
  const { userStore, companyStore, subscriptionStore, terminologyStore } = useRootStore();

  useLayoutEffect(() => {
    userStore.setUser(user);
    if (company) companyStore.setCompany(company);
    terminologyStore.setOverrides(terminology);
    subscriptionStore.setSubscription(subscription);
  }, [user, company, terminology, subscription]);

  let shell: React.ReactNode;
  if (isDocsRoute) {
    shell = (
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <DocsSidebar />

        <SidebarInset className="min-w-0 overflow-y-auto overflow-x-clip">
          <DocsTopBar />

          {children}
        </SidebarInset>
      </SidebarProvider>
    );
  } else if (hideAppShell) {
    shell = (
      <div className="h-svh flex">
        <main className="flex flex-col relative flex-1 overflow-y-auto bg-background min-w-0">
          <header className="sticky top-0 z-30 bg-background/80 backdrop-blur flex flex-col">
            <PublicNavbar isAuthenticated={isAuthenticated} onboardingComplete={onboardingComplete} />
          </header>

          <div className="flex flex-col flex-1 overflow-x-clip">{children}</div>
        </main>
      </div>
    );
  } else {
    shell = (
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <AppSidebar
          channelsNeedingActionCount={channelsNeedingActionCount}
          emailVerified={emailVerified}
          legalStatus={legalStatus}
          subscription={subscription}
          systemTaskCount={systemTaskCount}
          trialDaysLeft={trialDaysLeft}
          unreadThreadCount={unreadThreadCount}
          user={user}
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
    <>
      <AppLocalePreferenceSync displayLanguage={user?.displayLanguage} />

      {shell}
    </>
  );
}
