"use client";

import { DocsSidebar } from "@/app/[locale]/(static)/docs/components/docs-sidebar";
import { DocsTopBar } from "@/app/[locale]/(static)/docs/components/docs-topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

type Props = {
  children: React.ReactNode;
};

export function DocsShell({ children }: Props) {
  return (
    <SidebarProvider>
      <DocsSidebar />

      <SidebarInset className="min-w-0 overflow-y-auto overflow-x-clip">
        <DocsTopBar />

        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
