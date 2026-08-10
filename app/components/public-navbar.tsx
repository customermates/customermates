"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useRootStore } from "@/core/stores/root-store.provider";
import { IntlLink, usePathname } from "@/i18n/navigation";
import { AppLink } from "@/components/shared/app-link";
import { AppImage } from "@/components/shared/app-image";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { LanguageSelector } from "@/components/shared/language-selector";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { cn } from "@/core/utils/cn";

type Props = {
  isAuthenticated: boolean;
  onboardingComplete: boolean;
};

export const PublicNavbar = observer(({ isAuthenticated, onboardingComplete }: Props) => {
  const t = useTranslations();
  const { layoutStore } = useRootStore();
  const pathname = usePathname();

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

  const ctaTarget = !isAuthenticated ? "/auth/signin" : onboardingComplete ? "/dashboard" : "/onboarding/wizard";
  const ctaLabel = !isAuthenticated
    ? t("Common.actions.signIn")
    : onboardingComplete
      ? t("Common.actions.openApp")
      : t("Common.actions.continueSetup");
  const showCta = pathname !== ctaTarget;
  const ctaButton = showCta ? (
    <Button asChild size="sm" variant="softPrimary" onClick={closeMenu}>
      <AppLink appearance="unstyled" href={ctaTarget}>
        {ctaLabel}
      </AppLink>
    </Button>
  ) : null;

  const contactButton = (
    <Button asChild className="bg-transparent shadow-none" size="sm" variant="outline" onClick={closeMenu}>
      <IntlLink href="/contact">{t("Common.actions.contact")}</IntlLink>
    </Button>
  );

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
        </div>

        <div className="flex w-full items-center justify-between md:hidden">
          {renderHomeButton()}

          <Sheet open={layoutStore.isMenuOpen} onOpenChange={layoutStore.setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost">
                <Icon icon={layoutStore.isMenuOpen ? X : Menu} />
              </Button>
            </SheetTrigger>

            <SheetContent className="w-80 max-w-[85vw] gap-0" side="right">
              <SheetHeader>
                <SheetTitle className="sr-only">{logoAlt}</SheetTitle>
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
              </SheetBody>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
});
