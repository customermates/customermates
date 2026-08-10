import type { ComponentPropsWithoutRef, SVGProps } from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Icon } from "@/components/shared/icon";
import { AppLink } from "@/components/shared/app-link";

export type NavSecondaryItem = {
  key: string;
  title: string;
  icon: React.FC<SVGProps<SVGSVGElement>>;
  href?: string;
  onSelect?: (invoker: HTMLElement) => void;
};

type Props = {
  items: NavSecondaryItem[];
} & ComponentPropsWithoutRef<typeof SidebarGroup>;

export function NavSecondary({ items, ...props }: Props) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.key}>
              {item.href ? (
                <SidebarMenuButton asChild size="sm" tooltip={item.title}>
                  <AppLink
                    className="text-foreground no-underline hover:no-underline"
                    href={item.href}
                    id={`nav-${item.key}`}
                  >
                    <Icon icon={item.icon} />

                    <span>{item.title}</span>
                  </AppLink>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  id={`nav-${item.key}`}
                  size="sm"
                  tooltip={item.title}
                  onClick={(event) => item.onSelect?.(event.currentTarget)}
                >
                  <Icon icon={item.icon} />

                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
