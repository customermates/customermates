"use client";

import type { ExtendedUser } from "@/features/user/user.types";
import type { Company, SubscriptionStatus } from "@/generated/prisma";

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

type Props = {
  isAuthenticated: boolean;
  company: Company | null;
  subscriptionStatus: SubscriptionStatus | null;
  trialDaysLeft: number | null;
  systemTaskCount: number;
  user: ExtendedUser | null;
  defaultSidebarOpen?: boolean;
  children: React.ReactNode;
};

export function NavigationSwitch({
  isAuthenticated,
  company,
  subscriptionStatus,
  trialDaysLeft,
  systemTaskCount,
  user,
  defaultSidebarOpen = true,
  children,
}: Props) {
  const pathname = usePathname();
  const isDocsRoute = pathname === "/docs" || pathname.startsWith("/docs/");
  const isOnboardingWizard = pathname === "/onboarding/wizard" || pathname.startsWith("/onboarding/wizard/");
  const hideAppShell = !isAuthenticated || isOnboardingWizard;
  const { layoutStore, userStore, companyStore } = useRootStore();
  const shouldShowNavbar = hideAppShell && !isDocsRoute;

  useLayoutEffect(() => {
    layoutStore.setIsNavbarVisible(shouldShowNavbar);
  }, [shouldShowNavbar]);

  useLayoutEffect(() => {
    userStore.setUser(user);
    if (company) companyStore.setCompany(company);
  }, [user, company]);

  if (isDocsRoute) {
    return (
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <DocsSidebar />

        <SidebarInset className="min-w-0 overflow-y-auto overflow-x-clip">
          <DocsTopBar />

          {children}
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (hideAppShell) {
    return (
      <div className="h-screen flex">
        <main className="flex flex-col relative flex-1 overflow-y-auto bg-background min-w-0">
          <header className="sticky top-0 z-30 bg-background/80 backdrop-blur flex flex-col">
            <PublicNavbar />
          </header>

          <div className="flex flex-col flex-1 overflow-x-clip">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <AppSidebar
        subscriptionStatus={subscriptionStatus}
        systemTaskCount={systemTaskCount}
        trialDaysLeft={trialDaysLeft}
        user={user}
      />

      <SidebarInset className="min-w-0 overflow-x-clip">
        <TopBarActionsProvider>
          <AppTopBar />

          {children}
        </TopBarActionsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
