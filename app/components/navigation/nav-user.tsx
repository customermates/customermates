"use client";

import type { ExtendedUser } from "@/features/user/user.types";

import { ChevronsUpDown, LogIn as LogOut, Moon, Sun } from "lucide-react";
import { observer } from "mobx-react-lite";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export const NavUser = observer(function NavUser({ user, theme, labels, onThemeChange, onSignOut }: Props) {
  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
  const email = user?.email ?? "";
  const initials = getInitials(name);
  const avatarSrc = user?.avatarUrl ?? undefined;

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
              <Avatar className="size-8 rounded-lg">
                <AvatarImage alt={name} src={avatarSrc} />

                <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
              </Avatar>

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
