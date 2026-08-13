"use client";

import type { AccountMenuUser } from "./nav-user";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { signOutAction } from "@/app/[locale]/actions";
import { AppImage } from "@/components/shared/app-image";
import { AppLink } from "@/components/shared/app-link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { NavUser } from "./nav-user";

export function RestrictedAppSidebar({ homeHref, user }: { homeHref: string; user: AccountMenuUser | null }) {
  const t = useTranslations();
  const { isMobile, setOpenMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();

  function closeMobileSidebar(callback?: () => void) {
    if (isMobile) setOpenMobile(false);
    callback?.();
  }

  return (
    <Sidebar collapsible="icon" side="left" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <AppLink appearance="unstyled" href={homeHref}>
                <AppImage
                  alt={t("Common.imageAlt.logo")}
                  className="size-8 shrink-0 rounded-lg shadow-[0_0_10px_0] shadow-primary/10 dark:shadow-primary/20"
                  height={32}
                  loading="eager"
                  src="customermates-square.svg"
                  width={32}
                />

                <span className="truncate font-semibold text-sm">Customermates</span>
              </AppLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent aria-hidden />

      <SidebarFooter>
        <NavUser
          labels={{
            signOut: t("UserAvatar.signOut"),
            lightMode: t("UserAvatar.lightMode"),
            darkMode: t("UserAvatar.darkMode"),
          }}
          theme={resolvedTheme}
          user={user}
          onSignOut={() =>
            closeMobileSidebar(() => {
              void signOutAction().then((result) => {
                if (!result.ok) toastZodErrorTree(result.error);
              });
            })
          }
          onThemeChange={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
