"use client";

import type { LucideIcon } from "lucide-react";

import { ArrowLeft } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { AppLink } from "@/components/shared/app-link";

import { NavBadge } from "./nav-main";
import { NavLinkPendingIcon } from "./nav-link-pending-icon";

export type AreaNavGroup = {
  key: string;
  label: string;
  items: Array<{ key: string; title: string; href: string; icon: LucideIcon; badge?: number }>;
};

type Props = {
  area: string;
  backHref: string;
  backLabel: string;
  groups: AreaNavGroup[];
  pathname: string | null;
  onNavigate: () => void;
};

export function AreaNav({ area, backHref, backLabel, groups, pathname, onNavigate }: Props) {
  return (
    <nav aria-label={area} className="contents" data-area-nav={area}>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={backLabel}>
              <AppLink appearance="unstyled" href={backHref} id="nav-area-back" onClick={onNavigate}>
                <ArrowLeft />

                <span>{backLabel}</span>
              </AppLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      {groups.map((group) => (
        <SidebarGroup key={group.key} data-area-nav-group={group.key}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname !== null && (pathname === item.href || pathname.startsWith(item.href + "/"))}
                    tooltip={item.title}
                  >
                    <AppLink appearance="unstyled" href={item.href} id={`nav-${item.key}`} onClick={onNavigate}>
                      <NavLinkPendingIcon icon={item.icon} />

                      <span className="min-w-0 truncate">{item.title}</span>

                      <NavBadge count={item.badge ?? 0} />
                    </AppLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}
