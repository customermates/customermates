"use client";

import type { AccountState } from "@/features/auth/account-state";

import { LogOut, Menu, X } from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useRootStore } from "@/core/stores/root-store.provider";
import { IntlLink, usePathname } from "@/i18n/navigation";
import { AppLink } from "@/components/shared/app-link";
import { AppImage } from "@/components/shared/app-image";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { LanguageSelector } from "@/components/shared/language-selector";
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
import { BREAKPOINT_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { signOutAction } from "@/app/[locale]/actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { runUserAction } from "@/core/errors/report-application-error";
import { resolvePublicNavbarActions } from "./navigation/public-navbar-model";

type Props = {
  accountState: AccountState;
  hasValidSession: boolean;
};

export const PublicNavbar = observer(({ accountState, hasValidSession }: Props) => {
  const t = useTranslations();
  const { layoutStore } = useRootStore();
  const pathname = usePathname();
  const isDesktop = useMediaQuery(BREAKPOINT_QUERY.nav);
  const desktopHomeButtonRef = useRef<HTMLAnchorElement>(null);
  const firstMobileNavItemRef = useRef<HTMLAnchorElement>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isDesktop) layoutStore.setIsMenuOpen(false);
  }, [isDesktop, layoutStore]);

  function closeMenu() {
    layoutStore.setIsMenuOpen(false);
  }

  function isNavItemActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const publicNavItems = [
    { href: "/pricing", title: t("NavigationBar.pricing") },
    { href: "/features", title: t("NavigationBar.features") },
    { href: "/docs", title: t("NavigationBar.docs") },
  ];

  const logoAlt = t("Common.imageAlt.logo");
  const homeLabel = t("UserAvatar.home");
  function renderHomeButton(ref?: Ref<HTMLAnchorElement>) {
    return (
      <AppLink ref={ref} aria-label={`${logoAlt} ${homeLabel}`} href="/" onClick={closeMenu}>
        <AppImage
          alt={logoAlt}
          className="h-auto w-[156px] object-contain select-none"
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
  const ctaButton =
    cta && ctaLabel && pathname !== cta.href ? (
      <Button asChild size="sm" variant="softPrimary" onClick={closeMenu}>
        <AppLink appearance="unstyled" href={cta.href}>
          {ctaLabel}
        </AppLink>
      </Button>
    ) : null;

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      const result = await signOutAction();
      if (result.ok) return;

      toastZodErrorTree(result.error);
      setIsSigningOut(false);
    } catch (error) {
      setIsSigningOut(false);
      throw error;
    }
  }

  const signOutButton =
    actions.signOut !== "hidden" ? (
      <Button
        disabled={isSigningOut}
        size="sm"
        variant={actions.signOut === "setupEscape" ? "destructiveOutline" : "ghost"}
        onClick={() => runUserAction(handleSignOut)}
      >
        <LogOut aria-hidden className="size-4" />

        {t("UserAvatar.signOut")}
      </Button>
    ) : null;

  const contactButton = actions.showContact ? (
    <Button asChild size="sm" variant="secondary" onClick={closeMenu}>
      <IntlLink href="/contact">{t("Common.actions.contact")}</IntlLink>
    </Button>
  ) : null;

  function renderPreferenceButtons() {
    return (
      <div className="flex items-center gap-1">
        <LanguageSelector />

        <ThemeSwitcher />
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="marketing-container flex h-14 items-center justify-between sm:h-16">
        <div className="hidden items-center gap-3 nav:flex">{renderHomeButton(desktopHomeButtonRef)}</div>

        <nav className="hidden items-center gap-5 nav:flex">
          {publicNavItems.map((item) => (
            <AppLink
              key={item.href}
              aria-current={isNavItemActive(item.href) ? "page" : undefined}
              className={cn(!isNavItemActive(item.href) && "text-subdued")}
              href={item.href}
            >
              {item.title}
            </AppLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 nav:flex">
          {renderPreferenceButtons()}

          {contactButton}

          {ctaButton}

          {signOutButton}
        </div>

        <div className="flex w-full items-center justify-between nav:hidden">
          {renderHomeButton()}

          <Sheet open={!isDesktop && layoutStore.isMenuOpen} onOpenChange={layoutStore.setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button aria-label={t("Common.sidebar.toggle")} size="icon" variant="ghost">
                <Icon aria-hidden icon={layoutStore.isMenuOpen ? X : Menu} />
              </Button>
            </SheetTrigger>

            <SheetContent
              className="w-full max-w-none gap-0 border-0 bg-sidebar text-sidebar-foreground sm:max-w-none"
              side="right"
              onCloseAutoFocus={(event) => {
                if (!isDesktop) return;
                event.preventDefault();
                desktopHomeButtonRef.current?.focus();
              }}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                firstMobileNavItemRef.current?.focus();
              }}
            >
              <SheetHeader>
                <SheetTitle className="sr-only">{logoAlt}</SheetTitle>

                <SheetDescription className="sr-only">{t("Common.sidebar.description")}</SheetDescription>
              </SheetHeader>

              <SheetBody className="flex flex-col gap-3 pb-6">
                {publicNavItems.map((item, index) => (
                  <AppLink
                    key={item.href}
                    ref={index === 0 ? firstMobileNavItemRef : undefined}
                    aria-current={isNavItemActive(item.href) ? "page" : undefined}
                    className={cn("text-2xl font-medium", !isNavItemActive(item.href) && "text-subdued")}
                    href={item.href}
                    onClick={closeMenu}
                  >
                    {item.title}
                  </AppLink>
                ))}

                <div className="my-1 py-3">{renderPreferenceButtons()}</div>

                {contactButton}

                {ctaButton}

                {signOutButton}
              </SheetBody>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
});
