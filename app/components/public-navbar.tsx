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
import { useMediaQuery } from "@/hooks/use-media-query";
import { signOutAction } from "@/app/[locale]/actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { runUserAction } from "@/core/errors/report-application-error";
import { resolvePublicNavbarActions } from "./navigation/public-navbar-model";

type Props = {
  accountState: AccountState;
  hasValidSession: boolean;
};

const PUBLIC_NAV_DESKTOP_QUERY = "(min-width: 56rem)";

export const PublicNavbar = observer(({ accountState, hasValidSession }: Props) => {
  const t = useTranslations();
  const { layoutStore } = useRootStore();
  const pathname = usePathname();
  const isDesktop = useMediaQuery(PUBLIC_NAV_DESKTOP_QUERY);
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
          className="h-auto object-contain select-none"
          height={24}
          loading="eager"
          src="customermates.svg"
          width={156}
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
  function renderCtaButton(isMobile = false) {
    if (!cta || !ctaLabel || pathname === cta.href) return null;

    return (
      <Button
        asChild
        className={cn(
          isMobile &&
            "h-11 w-full rounded-full bg-sidebar-foreground px-5 text-base text-sidebar shadow-none hover:bg-sidebar-foreground/90 sm:w-auto sm:min-w-40",
        )}
        size={isMobile ? "default" : "sm"}
        variant={isMobile ? "default" : "softPrimary"}
        onClick={closeMenu}
      >
        <AppLink appearance="unstyled" href={cta.href}>
          {ctaLabel}
        </AppLink>
      </Button>
    );
  }

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

  function renderSignOutButton(isMobile = false) {
    if (actions.signOut === "hidden") return null;

    return (
      <Button
        className={cn(
          isMobile && "h-11 w-full rounded-full px-5 text-base shadow-none sm:w-auto sm:min-w-40",
          isMobile &&
            actions.signOut !== "setupEscape" &&
            "border border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
        disabled={isSigningOut}
        size={isMobile ? "default" : "sm"}
        variant={actions.signOut === "setupEscape" ? "destructiveOutline" : "ghost"}
        onClick={() => runUserAction(handleSignOut)}
      >
        <LogOut aria-hidden className="size-4" />

        {t("UserAvatar.signOut")}
      </Button>
    );
  }

  function renderContactButton(isMobile = false) {
    if (!actions.showContact) return null;

    return (
      <Button
        asChild
        className={cn(
          isMobile &&
            "h-11 w-full rounded-full border-sidebar-border bg-transparent px-5 text-base text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground sm:w-auto sm:min-w-40",
        )}
        size={isMobile ? "default" : "sm"}
        variant="secondary"
        onClick={closeMenu}
      >
        <IntlLink href="/contact">{t("Common.actions.contact")}</IntlLink>
      </Button>
    );
  }

  function renderPreferenceButtons(isMobile = false) {
    return (
      <div className="flex items-center gap-1">
        <LanguageSelector className={cn(isMobile && "size-11 rounded-full text-sidebar-foreground")} />

        <ThemeSwitcher className={cn(isMobile && "size-11 rounded-full text-sidebar-foreground")} />
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-6 sm:h-16 sm:px-8">
        <div className="hidden items-center gap-3 min-[56rem]:flex">{renderHomeButton(desktopHomeButtonRef)}</div>

        <nav className="hidden items-center gap-5 min-[56rem]:flex">
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

        <div className="hidden items-center gap-2 min-[56rem]:flex">
          {renderPreferenceButtons()}

          {renderContactButton()}

          {renderCtaButton()}

          {renderSignOutButton()}
        </div>

        <div className="flex w-full items-center justify-between min-[56rem]:hidden">
          {renderHomeButton()}

          <Sheet open={!isDesktop && layoutStore.isMenuOpen} onOpenChange={layoutStore.setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button aria-label={t("Common.sidebar.toggle")} size="icon" variant="ghost">
                <Icon aria-hidden icon={layoutStore.isMenuOpen ? X : Menu} />
              </Button>
            </SheetTrigger>

            <SheetContent
              className="w-full max-w-none gap-0 border-0 bg-sidebar text-sidebar-foreground shadow-none sm:max-w-none [&>[data-slot=sheet-close]]:size-11"
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
              <SheetHeader className="min-h-[calc(3.5rem+var(--safe-top))] flex-row items-center border-b border-sidebar-border/70 pt-[var(--safe-top)] pr-[calc(3.75rem+var(--safe-right))] pb-0 pl-[calc(1.5rem+var(--safe-left))] sm:min-h-[calc(4rem+var(--safe-top))] sm:pl-[calc(2rem+var(--safe-left))]">
                {renderHomeButton()}

                <SheetTitle className="sr-only">{logoAlt}</SheetTitle>

                <SheetDescription className="sr-only">{t("Common.sidebar.description")}</SheetDescription>
              </SheetHeader>

              <SheetBody className="pt-8 pr-[calc(1.5rem+var(--safe-right))] pb-[calc(1.5rem+var(--safe-bottom))] pl-[calc(1.5rem+var(--safe-left))] sm:pt-10 sm:pr-[calc(2rem+var(--safe-right))] sm:pb-[calc(2rem+var(--safe-bottom))] sm:pl-[calc(2rem+var(--safe-left))]">
                <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col">
                  <nav aria-label={t("Common.sidebar.title")} className="flex flex-col gap-3 sm:gap-4">
                    {publicNavItems.map((item, index) => (
                      <AppLink
                        key={item.href}
                        ref={index === 0 ? firstMobileNavItemRef : undefined}
                        aria-current={isNavItemActive(item.href) ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 w-fit items-center rounded-sm py-1 text-4xl font-medium leading-none tracking-[-0.035em] text-sidebar-foreground/85 transition-colors outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/70 focus-visible:ring-offset-4 focus-visible:ring-offset-sidebar sm:text-[2.5rem]",
                          isNavItemActive(item.href) && "text-sidebar-foreground",
                        )}
                        href={item.href}
                        onClick={closeMenu}
                      >
                        {item.title}
                      </AppLink>
                    ))}
                  </nav>

                  <div className="mt-auto pt-12 sm:pt-16">
                    <div className="border-t border-sidebar-border/70 pt-5 sm:pt-6">
                      <div className="inline-flex rounded-full border border-sidebar-border/80 bg-sidebar-accent/50 p-1">
                        {renderPreferenceButtons(true)}
                      </div>

                      <div className="mt-5 grid gap-2.5 sm:flex sm:flex-wrap">
                        {renderCtaButton(true)}

                        {renderContactButton(true)}

                        {renderSignOutButton(true)}
                      </div>
                    </div>
                  </div>
                </div>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
});
