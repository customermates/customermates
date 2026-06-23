"use client";

import type { SVGProps } from "react";

import NextLink from "next/link";
import { ChevronRight, Info } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/shared/icon";

type NavItem = {
  key: string;
  title: string;
  href: string;
  icon: React.FC<SVGProps<SVGSVGElement>>;
  visible: boolean;
  badge?: number;
  preview?: { label: string; tooltip: string };
  items?: NavItem[];
};

export type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
};

type Props = {
  groups: NavGroup[];
  selectedKey: string | null;
  pathname: string | null;
  onNavigate: (next: string) => void;
};

type NavMainParentProps = {
  item: NavItem;
  pathname: string | null;
  onNavigate: (next: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function NavMainParent({ item, pathname, onNavigate, open, onOpenChange }: NavMainParentProps) {
  return (
    <Collapsible asChild className="group/collapsible" open={open} onOpenChange={onOpenChange}>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={item.title} onClick={() => onOpenChange(!open)}>
          <Icon icon={item.icon} />

          <span className="min-w-0 truncate">{item.title}</span>

          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
        </SidebarMenuButton>

        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <SidebarMenuSub>
            {(item.items ?? []).map((sub) => {
              const subActive = pathname ? pathname === sub.href || pathname.startsWith(sub.href + "/") : false;
              return (
                <SidebarMenuSubItem key={sub.key}>
                  {subActive && (
                    <span aria-hidden className="absolute -left-[11px] top-1 bottom-1 w-0.5 rounded-full bg-primary" />
                  )}

                  <SidebarMenuSubButton asChild isActive={subActive}>
                    <NextLink href={sub.href} onClick={() => onNavigate(sub.key)}>
                      <span>{sub.title}</span>
                    </NextLink>
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

export const NavMain = observer(({ groups, selectedKey, pathname, onNavigate }: Props) => {
  const activeParentKey =
    groups
      .flatMap((group) => group.items)
      .find((item) =>
        (item.items ?? []).some(
          (sub) => pathname !== null && (pathname === sub.href || pathname.startsWith(sub.href + "/")),
        ),
      )?.key ?? null;

  const [openKey, setOpenKey] = useState<string | null>(activeParentKey);

  useEffect(() => {
    if (activeParentKey) setOpenKey(activeParentKey);
  }, [activeParentKey]);

  function renderItem(item: NavItem) {
    const isActive = selectedKey === item.key;

    if (item.items && item.items.length > 0) {
      return (
        <NavMainParent
          key={item.key}
          item={item}
          open={openKey === item.key}
          pathname={pathname}
          onNavigate={onNavigate}
          onOpenChange={(next) => setOpenKey(next ? item.key : null)}
        />
      );
    }

    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
          <NextLink href={item.href} onClick={() => onNavigate(item.key)}>
            <Icon icon={item.icon} />

            <span className="min-w-0 truncate">{item.title}</span>

            {(item.preview || (item.badge !== undefined && item.badge > 0)) && (
              <span className="ml-auto flex shrink-0 items-center gap-1.5 group-data-[collapsible=icon]:hidden">
                {item.preview && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-5 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-[11px] font-medium text-primary">
                        {item.preview.label}

                        <Info className="size-3" />
                      </span>
                    </TooltipTrigger>

                    <TooltipContent className="max-w-64 text-xs leading-relaxed">{item.preview.tooltip}</TooltipContent>
                  </Tooltip>
                )}

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-warning/25 px-1.5 text-[11px] font-medium text-warning tabular-nums">
                    {item.badge}
                  </span>
                )}
              </span>
            )}
          </NextLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <>
      {groups.map((group) => {
        if (group.items.length === 0) return null;
        return (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
});
