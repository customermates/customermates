"use client";

import type { AccountState, MarketingAccountProfile } from "@/features/auth/account-state";

import { ChevronDown, Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { IntlLink, usePathname } from "@/i18n/navigation";
import { AppLink } from "@/components/shared/app-link";
import { AppImage } from "@/components/shared/app-image";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { LocaleMenu } from "@/components/shared/locale-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { cn } from "@/core/utils/cn";
import { resolvePublicNavbarActions, resolvePublicNavGroups } from "./navigation/public-navbar-model";
import { PublicNavbarAccountMenu } from "./navigation/public-navbar-account-menu";
import { PublicNavbarSignOutButton } from "./navigation/public-navbar-sign-out-button";
import { isPrimaryPublicNavLink, PublicNavbarMenu } from "./navigation/public-navbar-menu";
import { MarketingContainer } from "@/components/marketing/marketing-container";

type Props = {
  accountState: AccountState;
  hasValidSession: boolean;
  onboardingIntent?: string;
  onSignedOut?: () => void;
  profile?: MarketingAccountProfile | null;
};

const mobileOverviewRowClassName =
  "flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left text-lg font-medium text-foreground no-underline outline-none hover:no-underline focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50";

export function PublicNavbar({ accountState, hasValidSession, onboardingIntent, onSignedOut, profile }: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  function closeMenu() {
    setIsMenuOpen(false);
  }

  function isNavItemActive(href: string) {
    return pathname === href;
  }

  const publicNavGroups = resolvePublicNavGroups(t);

  const logoAlt = t("Common.imageAlt.logo");
  const homeLabel = t("UserAvatar.home");
  function renderHomeButton() {
    return (
      <AppLink aria-label={`${logoAlt} ${homeLabel}`} href="/" onNavigate={closeMenu}>
        <AppImage
          alt={logoAlt}
          className="h-[18px] w-auto object-contain select-none"
          height={23}
          loading="eager"
          src="customermates.svg"
          width={229}
        />

        <span className="sr-only">{`${logoAlt} ${homeLabel}`}</span>
      </AppLink>
    );
  }

  const actions = resolvePublicNavbarActions({
    accountState,
    hasValidSession,
    onboardingIntent,
    pathname,
  });
  const { cta } = actions;
  const ctaLabel =
    cta?.label === "signIn"
      ? t("Common.actions.signIn")
      : cta?.label === "openApp"
        ? t("Common.actions.openApp")
        : cta?.label === "continueSetup"
          ? t("Common.actions.continueSetup")
          : null;
  function renderCtaButton(className?: string, prominent = false) {
    if (!cta || !ctaLabel || pathname === cta.href) return null;

    return (
      <Button asChild className={className} size="sm" variant={prominent ? "default" : "softPrimary"}>
        <AppLink appearance="unstyled" href={cta.href} onNavigate={closeMenu}>
          {ctaLabel}
        </AppLink>
      </Button>
    );
  }

  function renderSignOutButton(className?: string) {
    if (actions.signOut === "hidden") return null;

    return (
      <PublicNavbarSignOutButton
        className={className}
        onboardingIntent={onboardingIntent}
        variant="destructiveOutline"
        onSignedOut={onSignedOut}
      />
    );
  }

  function renderContactButton(className?: string) {
    if (!actions.showContact) return null;

    return (
      <Button
        asChild
        className={cn("border border-border text-subdued hover:text-foreground", className)}
        size="sm"
        variant="ghost"
      >
        <IntlLink href="/contact" prefetch={false} onNavigate={closeMenu}>
          {t("Common.actions.contact")}
        </IntlLink>
      </Button>
    );
  }

  function renderAccountMenu() {
    if (!hasValidSession || !profile) return null;

    return (
      <PublicNavbarAccountMenu
        cta={cta && ctaLabel && pathname !== cta.href ? { href: cta.href, label: ctaLabel } : null}
        onboardingIntent={onboardingIntent}
        profile={profile}
        showContact={actions.showContact}
        onSignedOut={onSignedOut}
      />
    );
  }

  function renderMobileProfile() {
    if (!hasValidSession || !profile) return null;

    return (
      <div className="flex items-center gap-2.5">
        <Avatar className="rounded-lg" name={profile.name || profile.email} size="lg" src={profile.avatarUrl} />

        <span className="grid min-w-0 text-sm leading-tight">
          {profile.name ? <span className="truncate font-medium">{profile.name}</span> : null}

          <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
        </span>
      </div>
    );
  }

  const showAccountMenu = hasValidSession && Boolean(profile);

  function renderPreferenceButtons() {
    return (
      <div className="flex items-center gap-2">
        <LocaleMenu className="[&_summary]:size-8" />

        <ThemeSwitcher />
      </div>
    );
  }

  return (
    <div className="border-b border-border">
      <MarketingContainer className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-6 xl:h-14 xl:max-w-[75rem] xl:border-x xl:border-border xl:gap-4">
        <div className="hidden justify-self-start xl:flex">{renderHomeButton()}</div>

        <PublicNavbarMenu
          ariaLabel={t("NavigationBar.public.primaryNavigation")}
          groups={publicNavGroups}
          pathname={pathname}
          pricingLabel={t("NavigationBar.pricing")}
          onNavigate={closeMenu}
        />

        <div className="hidden items-center gap-2 justify-self-end xl:flex">
          {renderPreferenceButtons()}

          {showAccountMenu ? (
            renderAccountMenu()
          ) : (
            <>
              <span
                aria-hidden
                className="hidden size-8 animate-pulse rounded-lg bg-muted [[data-session-hint]_&]:block"
              />

              <div className="flex items-center gap-2 [[data-session-hint]_&]:hidden">
                {renderContactButton()}

                {renderCtaButton(undefined, true)}

                {renderSignOutButton()}
              </div>
            </>
          )}
        </div>

        <div className="col-span-3 flex w-full items-center justify-between xl:hidden">
          {renderHomeButton()}

          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button aria-label={t("Common.sidebar.toggle")} size="icon" variant="ghost">
                <Icon aria-hidden icon={isMenuOpen ? X : Menu} />
              </Button>
            </SheetTrigger>

            <SheetContent
              className="inset-0 h-dvh max-h-none gap-0 border-0 bg-background text-foreground shadow-none data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
              showCloseButton={false}
              side="top"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>{logoAlt}</SheetTitle>

                <SheetDescription>{t("Common.sidebar.description")}</SheetDescription>
              </SheetHeader>

              <div className="shrink-0 border-b border-border pt-(--safe-top)">
                <MarketingContainer className="flex h-16 items-center justify-between">
                  {renderHomeButton()}

                  <SheetClose asChild>
                    <Button aria-label={t("Common.actions.close")} size="icon" variant="ghost">
                      <Icon aria-hidden icon={X} />
                    </Button>
                  </SheetClose>
                </MarketingContainer>
              </div>

              <nav
                data-public-nav-mobile
                aria-label={t("NavigationBar.public.primaryNavigation")}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                <MarketingContainer className="divide-y divide-border">
                  {publicNavGroups.map((group) => (
                    <details key={group.id} className="group" name="public-nav-mobile">
                      <summary
                        className={cn(
                          mobileOverviewRowClassName,
                          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                        )}
                      >
                        {group.title}

                        <ChevronDown
                          aria-hidden
                          className="pointer-events-none size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                        />
                      </summary>

                      <ul className="flex flex-col pb-4">
                        {group.links.map((link) => {
                          const linkActive =
                            isNavItemActive(link.href) && isPrimaryPublicNavLink(publicNavGroups, link);

                          return (
                            <li key={`${link.href}-${link.title}`}>
                              <AppLink
                                appearance="unstyled"
                                aria-current={linkActive ? "page" : undefined}
                                className={cn(
                                  "flex min-h-11 items-center text-base transition-colors duration-200 hover:text-foreground motion-reduce:transition-none",
                                  linkActive ? "font-semibold text-foreground" : "text-subdued",
                                )}
                                href={link.href}
                                onNavigate={closeMenu}
                              >
                                {link.title}
                              </AppLink>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  ))}

                  <AppLink
                    appearance="unstyled"
                    aria-current={isNavItemActive("/pricing") ? "page" : undefined}
                    className={cn(mobileOverviewRowClassName, isNavItemActive("/pricing") && "font-semibold")}
                    href="/pricing"
                    onNavigate={closeMenu}
                  >
                    {t("NavigationBar.pricing")}
                  </AppLink>
                </MarketingContainer>
              </nav>

              <div className="shrink-0 border-t border-border pb-(--safe-bottom)">
                <MarketingContainer className="flex flex-col gap-3 py-4">
                  {renderPreferenceButtons()}

                  {renderMobileProfile()}

                  <div className="flex gap-2 empty:hidden">
                    {renderContactButton("flex-1")}

                    {renderCtaButton("flex-1", true)}
                  </div>

                  {renderSignOutButton("w-full")}
                </MarketingContainer>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </MarketingContainer>
    </div>
  );
}
