"use client";

import type { ReactNode } from "react";

import NextLink from "next/link";
import { Plus, Search } from "lucide-react";

import { AppImage } from "@/components/shared/app-image";
import { SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

type Props = {
  homeHref: string;
  brandName: string;
  brandSubtitle?: ReactNode;
  logoAlt: string;
  searchLabel: string;
  addLabel: string;
  onSearch: () => void;
  onAdd: () => void;
};

export function NavHeader({
  homeHref,
  brandName,
  brandSubtitle,
  logoAlt,
  searchLabel,
  addLabel,
  onSearch,
  onAdd,
}: Props) {
  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild size="lg">
            <NextLink href={homeHref}>
              <AppImage
                alt={logoAlt}
                className="size-8 shrink-0 rounded-lg shadow-[0_0_10px_0] shadow-primary/10 dark:shadow-primary/20"
                height={32}
                loading="eager"
                src="customermates-square.svg"
                width={32}
              />

              <div className="flex flex-1 flex-col gap-1 text-left text-sm leading-tight min-w-0">
                <span className="truncate font-semibold">{brandName}</span>

                {brandSubtitle && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{brandSubtitle}</span>
                )}
              </div>
            </NextLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip={searchLabel} onClick={onSearch}>
            <Search />

            <span>{searchLabel}</span>

            <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-sidebar-border bg-sidebar-accent/60 px-1.5 font-sans text-[11px] text-sidebar-foreground/70">
              &#8984;K
            </kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton tooltip={addLabel} onClick={onAdd}>
            <Plus />

            <span>{addLabel}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
