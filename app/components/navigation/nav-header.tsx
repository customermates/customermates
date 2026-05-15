"use client";

import type { ReactNode } from "react";

import { Plus, Search } from "lucide-react";

import { IntlLink as NextLink } from "@/i18n/navigation";
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

              <span className="flex flex-col min-w-0 flex-1 leading-tight">
                <span className="truncate font-semibold text-sm">{brandName}</span>

                <span className="flex items-center gap-1 min-h-[18px] min-w-0 max-w-full text-xs text-muted-foreground animate-fade-in group-data-[collapsible=icon]:hidden">
                  {brandSubtitle}
                </span>
              </span>
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
