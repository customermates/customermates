"use client";

import type { ExtendedUser } from "@/features/user/user.service";

import { useLayoutEffect } from "react";

import type { Company } from "@/generated/prisma";

import { AppSidebar } from "../app-sidebar";
import { PublicNavbar } from "../public-navbar";

import { usePathname } from "@/i18n/navigation";
import { DocsSidebar } from "@/app/[locale]/(static)/docs/components/docs-sidebar";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  isAuthenticated: boolean;
  company: Company | null;
  subscriptionPlan: "basic" | "pro" | null;
  systemTaskCount: number;
  user: ExtendedUser | null;
  children: React.ReactNode;
};

export function NavigationSwitch({
  isAuthenticated,
  company,
  subscriptionPlan,
  systemTaskCount,
  user,
  children,
}: Props) {
  const pathname = usePathname();
  const isDocsRoute = pathname === "/docs" || pathname.startsWith("/docs/");
  const { layoutStore } = useRootStore();
  const shouldShowNavbar = !isAuthenticated && !isDocsRoute;

  useLayoutEffect(() => {
    layoutStore.setIsNavbarVisible(shouldShowNavbar);
  }, [layoutStore, shouldShowNavbar]);

  return (
    <div className="h-screen flex">
      {isDocsRoute ? (
        <DocsSidebar />
      ) : (
        isAuthenticated && (
          <AppSidebar
            company={company}
            subscriptionPlan={subscriptionPlan}
            systemTaskCount={systemTaskCount}
            user={user}
          />
        )
      )}

      <main className="flex flex-col relative flex-1 overflow-auto bg-background">
        {!isAuthenticated && !isDocsRoute && (
          <header className="sticky top-0 z-10 border-b border-divider bg-background flex flex-col">
            <PublicNavbar />
          </header>
        )}

        {children}
      </main>
    </div>
  );
}
