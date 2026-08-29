"use client";

import type { AccountState } from "@/features/auth/account-state";

import { BookOpen, Boxes, LogOut, Menu, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useRootStore } from "@/core/stores/root-store.provider";
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
import { signOutAction } from "@/app/[locale]/actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { runUserAction } from "@/core/errors/report-application-error";
import { resolvePublicNavbarActions } from "./navigation/public-navbar-model";
import { PublicNavbarMenu, type PublicNavGroup } from "./navigation/public-navbar-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MarketingContainer } from "@/components/marketing/marketing-container";

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
    return pathname === href;
  }

  const publicNavGroups: PublicNavGroup[] = [
    {
      description: t("NavigationBar.public.productDescription"),
      featured: { href: "/features", title: t("NavigationBar.features") },
      icon: Boxes,
      id: "product",
      secondary: {
        href: "/features/all",
        title: t("NavigationBar.public.allFeatures"),
      },
      title: t("NavigationBar.public.product"),
      sections: [
        {
          title: t("NavigationBar.public.coreCrm"),
          links: [
            {
              href: "/features/contact-management",
              title: t("NavigationBar.public.contactManagement"),
            },
            {
              href: "/features/pipeline",
              title: t("NavigationBar.public.pipeline"),
            },
            {
              href: "/features/unified-inbox",
              title: t("NavigationBar.public.unifiedInbox"),
            },
          ],
        },
        {
          title: t("NavigationBar.public.platform"),
          links: [
            {
              href: "/features/integrations",
              title: t("NavigationBar.public.integrations"),
            },
            { href: "/n8n-crm", title: t("NavigationBar.public.n8n") },
            { href: "/features/api", title: t("NavigationBar.public.api") },
            {
              href: "/features/self-hosted",
              title: t("NavigationBar.public.selfHosted"),
            },
          ],
        },
      ],
    },
    {
      description: t("NavigationBar.public.solutionsDescription"),
      featured: {
        href: "/for",
        title: t("NavigationBar.public.allSolutions"),
      },
      icon: UsersRound,
      id: "solutions",
      title: t("NavigationBar.public.solutions"),
      sections: [
        {
          title: t("NavigationBar.public.serviceTeams"),
          links: [
            {
              href: "/for/professional-services",
              title: t("NavigationBar.public.professionalServices"),
            },
            {
              href: "/for/agencies",
              title: t("NavigationBar.public.agencies"),
            },
            {
              href: "/for/consultants",
              title: t("NavigationBar.public.consultants"),
            },
          ],
        },
      ],
    },
    {
      description: t("NavigationBar.public.resourcesDescription"),
      featured: { href: "/blog", title: t("NavigationBar.public.blog") },
      icon: BookOpen,
      id: "resources",
      secondary: { href: "/docs", title: t("NavigationBar.docs") },
      title: t("NavigationBar.public.resources"),
      sections: [
        {
          title: t("NavigationBar.public.explore"),
          links: [{ href: "/compare", title: t("NavigationBar.public.compare") }],
        },
        {
          title: t("NavigationBar.public.guides"),
          links: [
            { href: "/docs/mcp", title: t("NavigationBar.public.mcpGuide") },
            {
              href: "/docs/self-hosting",
              title: t("NavigationBar.public.selfHostingGuide"),
            },
          ],
        },
        {
          title: t("NavigationBar.public.featuredTopics"),
          links: [
            {
              href: "/blog/agentic-crm",
              title: t("NavigationBar.public.agenticCrm"),
            },
            {
              href: "/blog/open-source-crm",
              title: t("NavigationBar.public.openSourceCrm"),
            },
          ],
        },
      ],
    },
  ];

  const logoAlt = t("Common.imageAlt.logo");
  const homeLabel = t("UserAvatar.home");
  function renderHomeButton() {
    return (
      <AppLink aria-label={`${logoAlt} ${homeLabel}`} href="/" onClick={closeMenu}>
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
  function renderCtaButton(className?: string) {
    if (!cta || !ctaLabel || pathname === cta.href) return null;

    return (
      <Button asChild className={className} size="sm" variant="softPrimary" onClick={closeMenu}>
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

  function renderSignOutButton(className?: string) {
    if (actions.signOut === "hidden") return null;

    return (
      <Button
        className={className}
        disabled={isSigningOut}
        size="sm"
        variant={actions.signOut === "setupEscape" ? "destructiveOutline" : "ghost"}
        onClick={() => runUserAction(handleSignOut)}
      >
        <LogOut aria-hidden className="size-4" />

        {t("UserAvatar.signOut")}
      </Button>
    );
  }

  function renderContactButton(className?: string) {
    if (!actions.showContact) return null;

    return (
      <Button asChild className={className} size="sm" variant="secondary" onClick={closeMenu}>
        <IntlLink href="/contact">{t("Common.actions.contact")}</IntlLink>
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
      <MarketingContainer className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="hidden justify-self-start xl:flex">{renderHomeButton()}</div>

        <PublicNavbarMenu
          ariaLabel={t("NavigationBar.public.primaryNavigation")}
          groups={publicNavGroups}
          pathname={pathname}
          pricingLabel={t("NavigationBar.pricing")}
          onNavigate={closeMenu}
        />

        <div className="hidden items-center gap-1.5 justify-self-end xl:flex">
          {renderPreferenceButtons()}

          {renderContactButton()}

          {renderCtaButton()}

          {renderSignOutButton()}
        </div>

        <div className="col-span-3 flex w-full items-center justify-between xl:hidden">
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
                <Accordion collapsible className="w-full" type="single">
                  {publicNavGroups.map((group) => (
                    <AccordionItem key={group.id} value={group.id}>
                      <AccordionTrigger className="text-base no-underline hover:no-underline">
                        <span className="flex items-center gap-2.5">
                          <Icon aria-hidden icon={group.icon} size="md" />

                          {group.title}
                        </span>
                      </AccordionTrigger>

                      <AccordionContent className="space-y-5">
                        <p className="px-2 text-sm leading-6 text-subdued">{group.description}</p>

                        <div className="flex flex-col">
                          {[group.featured, ...(group.secondary ? [group.secondary] : [])].map((link) => (
                            <AppLink
                              key={link.href}
                              aria-current={isNavItemActive(link.href) ? "page" : undefined}
                              className={cn(
                                "rounded-md px-2 py-2.5 text-sm font-medium",
                                !isNavItemActive(link.href) && "text-subdued",
                              )}
                              href={link.href}
                              onClick={closeMenu}
                            >
                              {link.title}
                            </AppLink>
                          ))}
                        </div>

                        {group.sections.map((section) => (
                          <div key={section.title}>
                            <p className="px-2 text-xs font-medium uppercase tracking-[0.14em] text-subdued">
                              {section.title}
                            </p>

                            <div className="mt-2 flex flex-col">
                              {section.links.map((link) => (
                                <AppLink
                                  key={link.href}
                                  aria-current={isNavItemActive(link.href) ? "page" : undefined}
                                  className={cn(
                                    "rounded-md px-2 py-2.5 text-sm",
                                    !isNavItemActive(link.href) && "text-subdued",
                                  )}
                                  href={link.href}
                                  onClick={closeMenu}
                                >
                                  {link.title}
                                </AppLink>
                              ))}
                            </div>
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                <AppLink
                  aria-current={isNavItemActive("/pricing") ? "page" : undefined}
                  className={cn("py-3 text-base", !isNavItemActive("/pricing") && "text-subdued")}
                  href="/pricing"
                  onClick={closeMenu}
                >
                  {t("NavigationBar.pricing")}
                </AppLink>

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
});
