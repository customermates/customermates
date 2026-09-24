"use client";

import type { AccountState } from "@/features/auth/account-state";

import { ChevronDown, CircleDollarSign, FileText, Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { IntlLink, usePathname } from "@/i18n/navigation";
import { AppLink } from "@/components/shared/app-link";
import { AppImage } from "@/components/shared/app-image";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { LocaleMenu } from "@/components/shared/locale-menu";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { cn } from "@/core/utils/cn";
import { resolvePublicNavbarActions, resolvePublicNavGroups } from "./navigation/public-navbar-model";
import { PublicNavbarSignOutButton } from "./navigation/public-navbar-sign-out-button";
import {
  isPrimaryPublicNavLink,
  PublicNavLinkIcon,
  PublicNavLinkMark,
  PublicNavbarMenu,
} from "./navigation/public-navbar-menu";
import { MarketingContainer } from "@/components/marketing/marketing-container";

type Props = {
  accountState: AccountState;
  hasValidSession: boolean;
  onboardingIntent?: string;
};

const mobileOverviewRowClassName =
  "flex min-h-14 w-full items-center justify-between gap-4 rounded-md py-4 text-left text-base font-medium text-sidebar-foreground no-underline transition-all outline-none hover:no-underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50";

export function PublicNavbar({ accountState, hasValidSession, onboardingIntent }: Props) {
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
        variant={actions.signOut === "setupEscape" ? "destructiveOutline" : "ghost"}
      />
    );
  }

  function renderContactButton(className?: string, subtle = false) {
    if (!actions.showContact) return null;

    return (
      <Button asChild className={className} size="sm" variant={subtle ? "ghost" : "secondary"}>
        <IntlLink href="/contact" prefetch={false} onNavigate={closeMenu}>
          {t("Common.actions.contact")}
        </IntlLink>
      </Button>
    );
  }

  function renderPreferenceButtons() {
    return (
      <div className="flex items-center gap-0.5">
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
          docsLabel={t("NavigationBar.docs")}
          groups={publicNavGroups}
          pathname={pathname}
          pricingLabel={t("NavigationBar.pricing")}
          onNavigate={closeMenu}
        />

        <div className="hidden items-center gap-1 justify-self-end xl:flex">
          {renderPreferenceButtons()}

          {renderContactButton(undefined, true)}

          {renderCtaButton(undefined, true)}

          {renderSignOutButton()}
        </div>

        <div className="col-span-3 flex w-full items-center justify-between xl:hidden">
          {renderHomeButton()}

          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button aria-label={t("Common.sidebar.toggle")} size="icon" variant="ghost">
                <Icon aria-hidden icon={isMenuOpen ? X : Menu} />
              </Button>
            </SheetTrigger>

            <SheetContent className="w-80 max-w-[85vw] gap-0 bg-sidebar text-sidebar-foreground" side="right">
              <SheetHeader>
                <SheetTitle className="sr-only">{logoAlt}</SheetTitle>

                <SheetDescription className="sr-only">{t("Common.sidebar.description")}</SheetDescription>
              </SheetHeader>

              <SheetBody className="flex flex-col gap-3 pb-6">
                <div className="w-full">
                  {publicNavGroups.map((group) => (
                    <details key={group.id} className="group border-b border-sidebar-border" name="public-nav-mobile">
                      <summary
                        className={cn(
                          mobileOverviewRowClassName,
                          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon aria-hidden icon={group.icon} size="md" />

                          {group.title}
                        </span>

                        <ChevronDown
                          aria-hidden
                          className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                        />
                      </summary>

                      <div className="pb-2">
                        <div className="flex flex-col gap-1 pt-1">
                          {group.links.map((link) => {
                            const linkActive =
                              isNavItemActive(link.href) && isPrimaryPublicNavLink(publicNavGroups, link);

                            return (
                              <AppLink
                                key={`${link.href}-${link.title}`}
                                aria-current={linkActive ? "page" : undefined}
                                className={cn(
                                  "flex min-h-10 items-center gap-2.5 rounded-md p-2 text-sm",
                                  !linkActive && "text-subdued",
                                )}
                                href={link.href}
                                onNavigate={closeMenu}
                              >
                                {link.mark ? (
                                  <PublicNavLinkMark mark={link.mark} />
                                ) : (
                                  <PublicNavLinkIcon icon={link.icon} />
                                )}

                                {link.title}
                              </AppLink>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  ))}

                  <AppLink
                    appearance="unstyled"
                    aria-current={isNavItemActive("/pricing") ? "page" : undefined}
                    className={cn(
                      mobileOverviewRowClassName,
                      "border-t border-border",
                      isNavItemActive("/pricing") && "bg-accent",
                    )}
                    href="/pricing"
                    onNavigate={closeMenu}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon aria-hidden icon={CircleDollarSign} size="md" />

                      {t("NavigationBar.pricing")}
                    </span>
                  </AppLink>

                  <AppLink
                    appearance="unstyled"
                    aria-current={isNavItemActive("/docs") ? "page" : undefined}
                    className={cn(
                      mobileOverviewRowClassName,
                      "border-t border-border",
                      isNavItemActive("/docs") && "bg-accent",
                    )}
                    href="/docs"
                    onNavigate={closeMenu}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon aria-hidden icon={FileText} size="md" />

                      {t("NavigationBar.docs")}
                    </span>
                  </AppLink>
                </div>

                <div className="my-1 py-3">{renderPreferenceButtons()}</div>

                {renderContactButton("w-full")}

                {renderCtaButton("w-full")}

                {renderSignOutButton("w-full")}
              </SheetBody>
            </SheetContent>
          </Sheet>
        </div>
      </MarketingContainer>
    </div>
  );
}
