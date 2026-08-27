"use client";

import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/core/utils/cn";

type Props = {
  children?: ReactNode;
  actions?: ReactNode;
  joinedContentBelow?: boolean;
};

export function ShellHeader({ children, actions, joinedContentBelow = false }: Props) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-border bg-background md:rounded-t-xl",
        !joinedContentBelow && "border-b",
      )}
    >
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
