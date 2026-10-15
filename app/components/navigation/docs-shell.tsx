"use client";

import type { AppMode } from "@/core/config/environment";

import { DocsSidebar } from "@/app/[locale]/(static)/docs/components/docs-sidebar";
import { DocsTopBar } from "@/app/[locale]/(static)/docs/components/docs-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type Props = {
  appMode: AppMode;
  children: React.ReactNode;
};

export function DocsShell({ appMode, children }: Props) {
  return (
    <SidebarProvider>
      <DocsSidebar />

      <SidebarInset className="min-w-0 overflow-y-auto overflow-x-clip">
        <DocsTopBar appMode={appMode} />

        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
