"use client";

import { Navbar as HeroNavbar, NavbarContent, NavbarMenu, NavbarMenuToggle } from "@heroui/navbar";
import { useLocale, useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Button, ButtonGroup } from "@heroui/button";

import { useRootStore } from "@/core/stores/root-store.provider";
import { usePathname } from "@/i18n/navigation";
import { XLink } from "@/components/x-link";
import { XImage } from "@/components/x-image";

export const PublicNavbar = observer(() => {
  const locale = useLocale();
  const t = useTranslations("");
  const { layoutStore } = useRootStore();
  const pathname = usePathname();
  const scheduleDemoHref =
    locale === "de"
      ? "https://calendly.com/customermates/produkt-demo"
      : "https://calendly.com/customermates/product-demo";

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
    { href: "/n8n-crm", title: t("NavigationBar.automation") },
    { href: "/docs", title: t("NavigationBar.docs") },
    { href: "/blog", title: t("NavigationBar.blog") },
  ];

  const logoAlt = t("Common.imageAlt.logo");
  const homeLabel = t("UserAvatar.home");
  const homeButton = (
    <XLink aria-label={`${logoAlt} ${homeLabel}`} href="/" onPress={closeMenu}>
      <XImage
        alt={logoAlt}
        className="object-contain select-none"
        height={24}
        loading="eager"
        src="customermates.svg"
        width={156}
      />

      <span className="sr-only">{`${logoAlt} ${homeLabel}`}</span>
    </XLink>
  );

  const signInButton = (
    <Button as={XLink} color="primary" href="/auth/signin" size="sm" variant="flat" onPress={closeMenu}>
      {t("Common.actions.signIn")}
    </Button>
  );

  const scheduleDemoButton = (
    <Button
      as={XLink}
      href={scheduleDemoHref}
      rel="noopener noreferrer"
      size="sm"
      target="_blank"
      variant="flat"
      onPress={closeMenu}
    >
      {t("Common.actions.scheduleDemo")}
    </Button>
  );

  return (
    <HeroNavbar
      disableAnimation
      isBordered
      classNames={{
        base: "[&_header]:max-w-7xl [&_header]:px-4 [&_header]:h-16",
      }}
      isMenuOpen={layoutStore.isMenuOpen}
      onMenuOpenChange={layoutStore.setIsMenuOpen}
    >
      <NavbarContent className="hidden md:flex gap-3" justify="start">
        {homeButton}
      </NavbarContent>

      <NavbarContent className="hidden md:flex gap-3" justify="center">
        {publicNavItems.map((item) => (
          <XLink key={item.href} className={isNavItemActive(item.href) ? "" : "text-subdued"} href={item.href}>
            {item.title}
          </XLink>
        ))}
      </NavbarContent>

      <NavbarContent className="hidden md:flex gap-3" justify="end">
        <ButtonGroup size="sm" variant="flat">
          {scheduleDemoButton}

          {signInButton}
        </ButtonGroup>
      </NavbarContent>

      <NavbarContent className="md:hidden" justify="start">
        {homeButton}
      </NavbarContent>

      <NavbarContent className="md:hidden" justify="end">
        <NavbarMenuToggle />

        <NavbarMenu className="flex flex-col gap-3 pt-3">
          {publicNavItems.map((item) => (
            <XLink
              key={item.href}
              className={isNavItemActive(item.href) ? "" : "text-subdued"}
              href={item.href}
              onClick={closeMenu}
            >
              {item.title}
            </XLink>
          ))}

          {scheduleDemoButton}

          {signInButton}
        </NavbarMenu>
      </NavbarContent>
    </HeroNavbar>
  );
});
