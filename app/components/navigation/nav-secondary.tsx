import type { ComponentPropsWithoutRef, SVGProps } from "react";

import { IntlLink as NextLink } from "@/i18n/navigation";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Icon } from "@/components/shared/icon";

export type NavSecondaryItem = {
  key: string;
  title: string;
  icon: React.FC<SVGProps<SVGSVGElement>>;
  href?: string;
  onSelect?: () => void;
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
                  <NextLink href={item.href}>
                    <Icon icon={item.icon} />

                    <span>{item.title}</span>
                  </NextLink>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton size="sm" tooltip={item.title} onClick={item.onSelect}>
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
