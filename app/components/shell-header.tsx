"use client";

import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type Props = {
  children?: ReactNode;
  actions?: ReactNode;
};

export function ShellHeader({ children, actions }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background md:rounded-t-xl">
      <div className="flex flex-1 min-w-0 items-center gap-2 px-4 ps-[calc(1rem+var(--safe-left,0px))]">
        <SidebarTrigger className="-ml-1" id="sidebar-trigger" />

        {children && (
          <>
            <Separator className="mr-2 bg-border data-[orientation=vertical]:h-4" orientation="vertical" />

            {children}
          </>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-2 px-4 pe-[calc(1rem+var(--safe-right,0px))]">{actions}</div>
      )}
    </header>
  );
}
