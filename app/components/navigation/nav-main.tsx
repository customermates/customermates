"use client";

import type { AnchorHTMLAttributes, ComponentProps, ReactNode, SVGProps } from "react";

import { useLinkStatus } from "next/link";
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
import { useRootStore } from "@/core/stores/root-store.provider";
import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { protectedHrefFromContent } from "@/components/shared/app-link";

type NavItem = {
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function NavLinkOverlayBridge() {
  const { pending } = useLinkStatus();
  const { loadingOverlayStore } = useRootStore();

  useEffect(() => {
    if (!pending) return;
    loadingOverlayStore.setIsLoading(true);
    return () => loadingOverlayStore.setIsLoading(false);
  }, [pending, loadingOverlayStore]);

  return null;
}

function NavRouteLink({
  children,
  href,
  pathname,
  ...props
}: Omit<ComponentProps<typeof IntlLink>, "href"> & {
  children: ReactNode;
  href: string;
  pathname: string | null;
}) {
  const hardNavigationHref = protectedHrefFromContent(href, pathname ?? "");
  if (hardNavigationHref) {
    return (
      <a href={hardNavigationHref} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  return (
    <IntlLink href={href} {...props}>
      <NavLinkOverlayBridge />

      {children}
    </IntlLink>
  );
}

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-warning/25 px-1.5 text-[11px] font-medium text-warning tabular-nums group-data-[collapsible=icon]:hidden">
      {count}
    </span>
  );
}

function NavMainParent({ item, pathname, onNavigate, open, onOpenChange }: NavMainParentProps) {
  const subBadgeCount = (item.items ?? []).reduce((sum, sub) => sum + (sub.badge ?? 0), 0);

  return (
    <Collapsible asChild className="group/collapsible" open={open} onOpenChange={onOpenChange}>
      <SidebarMenuItem>
        <SidebarMenuButton id={`nav-${item.key}`} tooltip={item.title} onClick={() => onOpenChange(!open)}>
          <Icon icon={item.icon} />

          <span className="min-w-0 truncate">{item.title}</span>

          {!open && <NavBadge count={subBadgeCount} />}

          <ChevronRight
            className={cn(
              "transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90",
              (open || subBadgeCount <= 0) && "ml-auto",
            )}
          />
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
                    <NavRouteLink
                      href={sub.href}
                      id={`nav-${sub.key}`}
                      pathname={pathname}
                      onClick={() => onNavigate(sub.key)}
                    >
                      <span>{sub.title}</span>

                      <NavBadge count={sub.badge ?? 0} />
                    </NavRouteLink>
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
          <NavRouteLink
            href={item.href}
            id={`nav-${item.key}`}
            pathname={pathname}
            onClick={() => onNavigate(item.key)}
          >
            <Icon icon={item.icon} />

            <span className="min-w-0 truncate">{item.title}</span>

            <NavBadge count={item.badge ?? 0} />
          </NavRouteLink>
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
