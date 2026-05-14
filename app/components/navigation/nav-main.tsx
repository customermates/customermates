"use client";

import type { SVGProps } from "react";

import { ChevronRight } from "lucide-react";
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
import { Icon } from "@/components/shared/icon";
import { IntlLink as NextLink, useRouter } from "@/i18n/navigation";

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
};

function NavMainParent({ item, pathname, onNavigate }: NavMainParentProps) {
  const router = useRouter();
  const subs = item.items ?? [];
  const isActiveParent = pathname
    ? subs.some((sub) => pathname === sub.href || pathname.startsWith(sub.href + "/"))
    : false;

  const [open, setOpen] = useState(isActiveParent);

  useEffect(() => {
    setOpen(isActiveParent);
  }, [isActiveParent]);

  const firstSub = subs[0];

  return (
    <Collapsible asChild className="group/collapsible" open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={item.title}
          onClick={() => {
            setOpen(true);
            if (firstSub) {
              onNavigate(firstSub.key);
              router.push(firstSub.href);
            }
          }}
        >
          <Icon icon={item.icon} />

          <span>{item.title}</span>

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

export const NavMain = observer(function NavMain({ groups, selectedKey, pathname, onNavigate }: Props) {
  function renderItem(item: NavItem) {
    const isActive = selectedKey === item.key;

    if (item.items && item.items.length > 0)
      return <NavMainParent key={item.key} item={item} pathname={pathname} onNavigate={onNavigate} />;

    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
          <NextLink href={item.href} onClick={() => onNavigate(item.key)}>
            <Icon icon={item.icon} />

            <span>{item.title}</span>

            {item.badge !== undefined && item.badge > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-warning/25 px-1.5 text-[11px] font-medium text-warning tabular-nums group-data-[collapsible=icon]:hidden">
                {item.badge}
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
