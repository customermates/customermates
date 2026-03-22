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
          <header className="sticky top-0 z-30 border-b border-divider bg-background flex flex-col">
            <PublicNavbar />
          </header>
        )}

        <div className="pointer-events-none absolute inset-0 -top-32 md:-top-48 bg-size-[40px_40px] bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#171717_1px,transparent_1px),linear-gradient(to_bottom,#171717_1px,transparent_1px)] mask-[linear-gradient(to_bottom,black,transparent_80%),linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] mask-intersect" />

        {children}
      </main>
    </div>
  );
}
