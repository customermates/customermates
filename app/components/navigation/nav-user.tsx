"use client";

import type { TenantUser } from "@/features/user/user.schema";

import {
  BookOpen,
  ChevronsUpDown,
  Keyboard,
  Languages,
  LogIn as LogOut,
  MessageCircle,
  Palette,
  PanelLeft,
  UserCircle,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { useRef } from "react";

import { AppChip } from "@/components/chip/app-chip";
import { AppLink } from "@/components/shared/app-link";
import { ActiveShortcutKeys } from "@/app/components/keyboard-shortcuts/active-shortcut-keys";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export type AccountMenuUser = Pick<TenantUser, "firstName" | "lastName" | "email" | "avatarUrl">;

export type ThemeChoice = "system" | "light" | "dark";

type Props = {
  user: AccountMenuUser | null;
  theme: ThemeChoice;
  language: string;
  languages: ReadonlyArray<{ value: string; label: string }>;
  restricted: boolean;
  customizable: boolean;
  emailVerified: boolean | null;
  profileHref: string;
  docsHref: string;
  labels: {
    menu: string;
    profile: string;
    notVerified: string;
    theme: string;
    themes: Record<ThemeChoice, string>;
    language: string;
    keyboardShortcuts: string;
    documentation: string;
    feedback: string;
    customizeSidebar: string;
    signOut: string;
  };
  onNavigate: () => void;
  onThemeChange: (theme: ThemeChoice) => void;
  onLanguageChange: (language: string) => void;
  onKeyboardShortcuts?: (invoker: HTMLElement | null) => void;
  onFeedback: (invoker: HTMLElement) => void;
  onCustomizeSidebar: () => void;
  onSignOut: () => void;
};

const THEME_CHOICES: ThemeChoice[] = ["system", "light", "dark"];

export const NavUser = observer(
  ({
    user,
    theme,
    language,
    languages,
    restricted,
    customizable,
    emailVerified,
    profileHref,
    docsHref,
    labels,
    onNavigate,
    onThemeChange,
    onLanguageChange,
    onKeyboardShortcuts,
    onFeedback,
    onCustomizeSidebar,
    onSignOut,
  }: Props) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const handingOffFocusRef = useRef(false);
    const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
    const email = user?.email ?? "";
    const notVerified = emailVerified === false && (
      <AppChip className="h-[16px] px-1 text-[10px]" variant="warning">
        {labels.notVerified}
      </AppChip>
    );

    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                ref={triggerRef}
                aria-label={`${name || email}, ${labels.menu}`}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                id="nav-personal-menu"
                size="lg"
                tooltip={name || email}
              >
                <Avatar className="rounded-lg" name={name} size="lg" src={user?.avatarUrl ?? undefined} />

                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{name || email}</span>

                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    {notVerified}

                    <span className="truncate">{email}</span>
                  </span>
                </div>

                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              aria-labelledby="nav-personal-menu"
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side="top"
              sideOffset={4}
              onCloseAutoFocus={(event) => {
                if (!handingOffFocusRef.current) return;
                handingOffFocusRef.current = false;
                event.preventDefault();
              }}
            >
              {!restricted && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <AppLink appearance="unstyled" href={profileHref} onClick={onNavigate}>
                        <UserCircle />

                        <span className="flex-1">{labels.profile}</span>

                        {notVerified}
                      </AppLink>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette />

                    <span>{labels.theme}</span>
                  </DropdownMenuSubTrigger>

                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={theme}
                      onValueChange={(value) => onThemeChange(value as ThemeChoice)}
                    >
                      {THEME_CHOICES.map((choice) => (
                        <DropdownMenuRadioItem key={choice} value={choice}>
                          {labels.themes[choice]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {!restricted && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Languages />

                        <span className="flex-1">{labels.language}</span>

                        <span className="text-xs text-muted-foreground">
                          {languages.find((candidate) => candidate.value === language)?.label}
                        </span>
                      </DropdownMenuSubTrigger>

                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup value={language} onValueChange={onLanguageChange}>
                          {languages.map((candidate) => (
                            <DropdownMenuRadioItem key={candidate.value} value={candidate.value}>
                              {candidate.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    {onKeyboardShortcuts && (
                      <DropdownMenuItem
                        onSelect={() => {
                          handingOffFocusRef.current = true;
                          onKeyboardShortcuts(triggerRef.current);
                        }}
                      >
                        <Keyboard />

                        <span className="flex-1">{labels.keyboardShortcuts}</span>

                        <ActiveShortcutKeys id="shortcuts" />
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuItem asChild>
                      <AppLink appearance="unstyled" href={docsHref} prefetch={false} onClick={onNavigate}>
                        <BookOpen />

                        <span>{labels.documentation}</span>
                      </AppLink>
                    </DropdownMenuItem>

                    <DropdownMenuItem onSelect={() => onFeedback(triggerRef.current ?? document.body)}>
                      <MessageCircle />

                      <span>{labels.feedback}</span>
                    </DropdownMenuItem>

                    {customizable && (
                      <DropdownMenuItem onSelect={onCustomizeSidebar}>
                        <PanelLeft />

                        <span>{labels.customizeSidebar}</span>
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
                <LogOut />

                <span>{labels.signOut}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  },
);
