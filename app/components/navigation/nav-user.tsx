"use client";

import type { ExtendedUser } from "@/features/user/user.types";

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
import { useAgentTarget } from "@/features/agent-chat/ui-targets";

type Props = {
  user: ExtendedUser | null;
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
  const avatarSrc = user?.avatarUrl ?? undefined;
  const accountTarget = useAgentTarget("sidebar.account", "Your account menu — theme toggle and sign out");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
              tooltip={name || email}
              {...accountTarget}
            >
              <Avatar className="rounded-lg" name={name} size="lg" src={avatarSrc} />

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
