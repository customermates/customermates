"use client";

import type { SVGProps } from "react";

import { ChevronRight } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Icon } from "@/components/shared/icon";
import { AppLink } from "@/components/shared/app-link";

import { NavLinkPendingIndicator } from "./nav-link-pending-indicator";

export type NavItem = {
  key: string;
  title: string;
  href: string;
  icon: React.FC<SVGProps<SVGSVGElement>>;
  visible: boolean;
  badge?: number;
  items?: NavItem[];
};

export type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
};

type NavMainParentProps = {
  item: NavItem;
  pathname: string | null;
  onNavigate: (next: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemProps?: React.ComponentProps<"li">;
  action?: React.ReactNode;
};

export function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-warning/25 px-1.5 text-[11px] font-medium text-warning tabular-nums group-data-[collapsible=icon]:hidden">
      {count}
    </span>
  );
}

export function NavMainParent({
  item,
  pathname,
  onNavigate,
  open,
  onOpenChange,
  itemProps,
  action,
}: NavMainParentProps) {
  const subBadgeCount = (item.items ?? []).reduce((sum, sub) => sum + (sub.badge ?? 0), 0);

  return (
    <Collapsible asChild className="group/collapsible" open={open} onOpenChange={onOpenChange}>
      <SidebarMenuItem {...itemProps}>
        <SidebarMenuButton
          className={
            action ? "pr-8 md:pr-2 md:group-focus-within/menu-item:pr-8 md:group-hover/menu-item:pr-8" : undefined
          }
          id={`nav-${item.key}`}
          tooltip={item.title}
          onClick={() => onOpenChange(!open)}
        >
          <Icon icon={item.icon} />

          <span className="min-w-0 truncate">{item.title}</span>

          {!open && <NavBadge count={subBadgeCount} />}

          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
        </SidebarMenuButton>

        {action}

        <CollapsibleContent
          className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
          onMouseDown={itemProps ? (event) => event.stopPropagation() : undefined}
        >
          <SidebarMenuSub>
            {(item.items ?? []).map((sub) => {
              const subActive = pathname ? pathname === sub.href || pathname.startsWith(sub.href + "/") : false;
              return (
                <SidebarMenuSubItem key={sub.key}>
                  {subActive && (
                    <span aria-hidden className="absolute -left-[11px] top-1 bottom-1 w-0.5 rounded-full bg-primary" />
                  )}

                  <SidebarMenuSubButton asChild isActive={subActive}>
                    <AppLink
                      appearance="unstyled"
                      href={sub.href}
                      id={`nav-${sub.key}`}
                      onClick={() => onNavigate(sub.key)}
                    >
                      <span className="min-w-0 truncate">{sub.title}</span>

                      <NavBadge count={sub.badge ?? 0} />

                      <NavLinkPendingIndicator />
                    </AppLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
