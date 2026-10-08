"use client";

import type { ReactNode } from "react";

import { Loader2, Plus, Search, Sparkles } from "lucide-react";

import { ActiveShortcutKeys } from "@/app/components/keyboard-shortcuts/active-shortcut-keys";
import { AppImage } from "@/components/shared/app-image";
import { AppLink } from "@/components/shared/app-link";
import { SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

import { NavLinkPendingIndicator } from "./nav-link-pending-indicator";

type Props = {
  overlaysDisabled?: boolean;
  homeHref: string;
  brandName: string;
  brandSubtitle?: ReactNode;
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
  homeHref,
  brandName,
  brandSubtitle,
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
  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild size="lg">
            <AppLink appearance="unstyled" href={homeHref}>
              <AppImage
                alt={logoAlt}
                className="size-8 shrink-0 rounded-lg shadow-[0_0_10px_0] shadow-primary/10 dark:shadow-primary/20"
                height={32}
                loading="eager"
                src="customermates-square.svg"
                width={32}
              />

              <span className="flex flex-col min-w-0 flex-1 leading-tight">
                <span className="truncate font-semibold text-sm">{brandName}</span>

                {brandSubtitle && (
                  <span className="flex items-center gap-1 min-h-[18px] min-w-0 max-w-full text-xs text-muted-foreground animate-fade-in group-data-[collapsible=icon]:hidden">
                    {brandSubtitle}
                  </span>
                )}
              </span>

              <NavLinkPendingIndicator />
            </AppLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

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
