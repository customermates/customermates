"use client";

import type { AccountState } from "@/features/auth/account-state";

import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
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
import { signOutAction } from "@/app/[locale]/actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { resolvePublicNavbarActions } from "./navigation/public-navbar-model";

type Props = {
  accountState: AccountState;
  hasValidSession: boolean;
};

export const PublicNavbar = observer(({ accountState, hasValidSession }: Props) => {
  const t = useTranslations();
  const { layoutStore } = useRootStore();
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
  function renderHomeButton() {
    return (
      <AppLink aria-label={`${logoAlt} ${homeLabel}`} href="/" onClick={closeMenu}>
        <AppImage
          alt={logoAlt}
          className="object-contain select-none"
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
    const result = await signOutAction();
    if (!result.ok) {
      toastZodErrorTree(result.error);
      setIsSigningOut(false);
    }
  }

  const signOutButton =
    actions.signOut !== "hidden" ? (
      <Button
        disabled={isSigningOut}
        size="sm"
        variant={actions.signOut === "setupEscape" ? "destructiveOutline" : "ghost"}
        onClick={() => void handleSignOut()}
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
    <div className="sticky top-0 z-40 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="hidden items-center gap-3 md:flex">{renderHomeButton()}</div>

        <nav className="hidden items-center gap-3 md:flex">
          {publicNavItems.map((item) => (
            <AppLink key={item.href} className={cn(!isNavItemActive(item.href) && "text-subdued")} href={item.href}>
              {item.title}
            </AppLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {renderPreferenceButtons()}

          {contactButton}

          {ctaButton}

          {signOutButton}
        </div>

        <div className="flex w-full items-center justify-between md:hidden">
          {renderHomeButton()}

          <Sheet open={layoutStore.isMenuOpen} onOpenChange={layoutStore.setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button aria-label={t("Common.sidebar.toggle")} size="icon" variant="ghost">
                <Icon aria-hidden icon={layoutStore.isMenuOpen ? X : Menu} />
              </Button>
            </SheetTrigger>

            <SheetContent className="w-80 max-w-[85vw] gap-0 bg-sidebar text-sidebar-foreground" side="right">
              <SheetHeader>
                <SheetTitle className="sr-only">{logoAlt}</SheetTitle>

                <SheetDescription className="sr-only">{t("Common.sidebar.description")}</SheetDescription>
              </SheetHeader>

              <SheetBody className="flex flex-col gap-3 pb-6">
                {publicNavItems.map((item) => (
                  <AppLink
                    key={item.href}
                    className={cn(!isNavItemActive(item.href) && "text-subdued")}
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
