"use client";

import type { MarketingAccountProfile } from "@/features/auth/account-state";

import { LayoutDashboard, LogOut, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { usePublicNavbarSignOut } from "./use-public-navbar-sign-out";

import { AppLink } from "@/components/shared/app-link";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  cta: { href: string; label: string } | null;
  onboardingIntent?: string;
  onSignedOut?: () => void;
  profile: MarketingAccountProfile;
  showContact: boolean;
};

export function PublicNavbarAccountMenu({ cta, onboardingIntent, onSignedOut, profile, showContact }: Props) {
  const t = useTranslations();
  const { signOut, signingOut } = usePublicNavbarSignOut(onboardingIntent, onSignedOut);
  const displayName = profile.name || profile.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-public-account-menu
          aria-label={displayName}
          className="flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          type="button"
        >
          <Avatar className="rounded-lg" name={profile.name || profile.email} size="lg" src={profile.avatarUrl} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56 rounded-lg" sideOffset={8}>
        <DropdownMenuLabel className="flex items-center gap-2.5 font-normal">
          <Avatar className="rounded-lg" name={profile.name || profile.email} size="lg" src={profile.avatarUrl} />

          <span className="grid min-w-0 text-sm leading-tight">
            {profile.name ? <span className="truncate font-medium">{profile.name}</span> : null}

            <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {cta ? (
          <DropdownMenuItem asChild>
            <AppLink appearance="unstyled" href={cta.href}>
              <LayoutDashboard aria-hidden className="size-4" />

              {cta.label}
            </AppLink>
          </DropdownMenuItem>
        ) : null}

        {showContact ? (
          <DropdownMenuItem asChild>
            <AppLink appearance="unstyled" href="/contact">
              <Mail aria-hidden className="size-4" />

              {t("Common.actions.contact")}
            </AppLink>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled={signingOut} variant="destructive" onSelect={() => runUserAction(signOut)}>
          <LogOut aria-hidden className="size-4" />

          {t("UserAvatar.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
