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

  const publicNavGroups: PublicNavGroup[] = [
    {
      id: "product",
      title: t("NavigationBar.public.product"),
      columns: [
        {
          title: t("NavigationBar.public.overview"),
          links: [
            { href: "/features", title: t("NavigationBar.features") },
            {
              href: "/features/all",
              title: t("NavigationBar.public.allFeatures"),
            },
          ],
        },
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
              href: "/features/self-hosted",
              title: t("NavigationBar.public.selfHosted"),
            },
            { href: "/features/api", title: t("NavigationBar.public.api") },
            {
              href: "/features/integrations",
              title: t("NavigationBar.public.integrations"),
            },
            {
              href: "/features/linkedin-integration",
              title: t("NavigationBar.public.linkedinIntegration"),
            },
            {
              href: "/features/outlook-integration",
              title: t("NavigationBar.public.outlookIntegration"),
            },
            {
              href: "/features/slack-integration",
              title: t("NavigationBar.public.slackIntegration"),
            },
            { href: "/n8n-crm", title: t("NavigationBar.public.n8n") },
          ],
        },
      ],
    },
    {
      id: "solutions",
      title: t("NavigationBar.public.solutions"),
      columns: [
        {
          title: t("NavigationBar.public.overview"),
          links: [{ href: "/for", title: t("NavigationBar.public.allSolutions") }],
        },
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
        {
          title: t("NavigationBar.public.growingBusinesses"),
          links: [
            {
              href: "/for/smb",
              title: t("NavigationBar.public.smallBusinesses"),
            },
          ],
        },
      ],
    },
    {
      id: "resources",
      title: t("NavigationBar.public.resources"),
      columns: [
        {
          title: t("NavigationBar.public.explore"),
          links: [
            { href: "/docs", title: t("NavigationBar.docs") },
            { href: "/blog", title: t("NavigationBar.public.blog") },
            { href: "/compare", title: t("NavigationBar.public.compare") },
          ],
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
          title: t("NavigationBar.public.research"),
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
        <LocaleMenu />

        <ThemeSwitcher />
      </div>
    );
  }

  return (
    <div className="bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="hidden items-center gap-3 lg:flex">{renderHomeButton()}</div>

        <PublicNavbarMenu
          ariaLabel={t("NavigationBar.public.primaryNavigation")}
          groups={publicNavGroups}
          pathname={pathname}
          pricingLabel={t("NavigationBar.pricing")}
          onNavigate={closeMenu}
        />

        <div className="hidden items-center gap-2 lg:flex">
          {renderPreferenceButtons()}

          {contactButton}

          {ctaButton}

          {signOutButton}
        </div>

        <div className="flex w-full items-center justify-between lg:hidden">
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
                <Accordion className="w-full" type="multiple">
                  {publicNavGroups.map((group) => (
                    <AccordionItem key={group.id} value={group.id}>
                      <AccordionTrigger className="text-base no-underline hover:no-underline">
                        {group.title}
                      </AccordionTrigger>

                      <AccordionContent className="space-y-5">
                        {group.columns.map((column) => (
                          <div key={column.title}>
                            <p className="px-2 text-xs font-medium uppercase tracking-[0.14em] text-subdued">
                              {column.title}
                            </p>

                            <div className="mt-2 flex flex-col">
                              {column.links.map((link) => (
                                <AppLink
                                  key={link.href}
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
                  className={cn("py-3 text-base", !isNavItemActive("/pricing") && "text-subdued")}
                  href="/pricing"
                  onClick={closeMenu}
                >
                  {t("NavigationBar.pricing")}
                </AppLink>

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
