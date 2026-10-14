"use client";

import type { ReactNode } from "react";

import { ChevronDown, Loader2, Plus, Search, Sparkles } from "lucide-react";

import { ActiveShortcutKeys } from "@/app/components/keyboard-shortcuts/active-shortcut-keys";
import { AppImage } from "@/components/shared/app-image";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

type Props = {
  overlaysDisabled?: boolean;
  quickActions: boolean;
  workspaceMenu: ReactNode | null;
  workspaceMenuLabel: string;
  brandName: string;
  logoAlt: string;
  assistantLabel?: string;
  assistantBusy?: boolean;
  assistantBusyLabel?: string;
  searchLabel: string;
  addLabel: string;
  onAssistant?: (invoker: HTMLElement) => void;
  onSearch: (invoker: HTMLElement) => void;
  onAdd: (invoker: HTMLElement) => void;
};

export function NavHeader({
  overlaysDisabled = false,
  quickActions,
  workspaceMenu,
  workspaceMenuLabel,
  brandName,
  logoAlt,
  assistantLabel,
  assistantBusy,
  assistantBusyLabel,
  searchLabel,
  addLabel,
  onAssistant,
  onSearch,
  onAdd,
}: Props) {
  const brand = (
    <>
      <AppImage
        alt={logoAlt}
        className="size-4 shrink-0 rounded-[4px]"
        height={16}
        loading="eager"
        src="customermates-square.svg"
        width={16}
      />

      <span className="min-w-0 flex-1 truncate font-medium">{brandName}</span>
    </>
  );

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          {workspaceMenu ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  aria-label={`${brandName}, ${workspaceMenuLabel}`}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  id="nav-workspace-menu"
                  tooltip={brandName}
                >
                  {brand}

                  <ChevronDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="start"
                aria-labelledby="nav-workspace-menu"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side="bottom"
                sideOffset={4}
              >
                {workspaceMenu}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <SidebarMenuButton asChild>
              <div>{brand}</div>
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      </SidebarMenu>

      {quickActions && (
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-disabled={overlaysDisabled}
              id="nav-search"
              tooltip={{
                children: <ShortcutTooltip label={searchLabel} shortcut={<ActiveShortcutKeys id="search" />} />,
              }}
              onClick={(event) => {
                if (!overlaysDisabled) onSearch(event.currentTarget);
              }}
            >
              <Search />

              <span>{searchLabel}</span>

              <ActiveShortcutKeys className="ml-auto" id="search" />
            </SidebarMenuButton>
          </SidebarMenuItem>

          {assistantLabel && onAssistant && (
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-disabled={overlaysDisabled}
                id="nav-assistant"
                tooltip={{
                  children: (
                    <ShortcutTooltip
                      label={assistantBusy ? (assistantBusyLabel ?? assistantLabel) : assistantLabel}
                      shortcut={<ActiveShortcutKeys id="askMate" />}
                    />
                  ),
                }}
                onClick={(event) => {
                  if (!overlaysDisabled) onAssistant(event.currentTarget);
                }}
              >
                {assistantBusy ? <Loader2 aria-label={assistantBusyLabel} className="animate-spin" /> : <Sparkles />}

                <span>{assistantLabel}</span>

                <ActiveShortcutKeys className="ml-auto" id="askMate" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          <SidebarMenuItem>
            <SidebarMenuButton
              aria-disabled={overlaysDisabled}
              id="nav-add"
              tooltip={{
                children: <ShortcutTooltip label={addLabel} shortcut={<ActiveShortcutKeys id="add" />} />,
              }}
              onClick={(event) => {
                if (!overlaysDisabled) onAdd(event.currentTarget);
              }}
            >
              <Plus />

              <span>{addLabel}</span>

              <ActiveShortcutKeys className="ml-auto" id="add" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      )}
    </SidebarHeader>
  );
}

function ShortcutTooltip({ label, shortcut }: { label: string; shortcut: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      {label}

      {shortcut}
    </span>
  );
}
