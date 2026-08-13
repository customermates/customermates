"use client";

import type { TenantUser } from "@/features/user/user.schema";

import { ChevronsUpDown, LogIn as LogOut, Moon, Sun } from "lucide-react";
import { observer } from "mobx-react-lite";

import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export type AccountMenuUser = Pick<TenantUser, "firstName" | "lastName" | "email" | "avatarUrl">;

type Props = {
  user: AccountMenuUser | null;
  theme: string | undefined;
  labels: {
    signOut: string;
    lightMode: string;
    darkMode: string;
  };
  onThemeChange: () => void;
  onSignOut: () => void;
};

export const NavUser = observer(({ user, theme, labels, onThemeChange, onSignOut }: Props) => {
  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
  const email = user?.email ?? "";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
              tooltip={name || email}
            >
              <Avatar className="rounded-lg" name={name} size="lg" src={user?.avatarUrl ?? undefined} />

              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name || email}</span>

                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>

              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side="top"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onThemeChange();
                }}
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}

                <span>{theme === "dark" ? labels.lightMode : labels.darkMode}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem variant="destructive" onClick={onSignOut}>
              <LogOut />

              <span>{labels.signOut}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
});
