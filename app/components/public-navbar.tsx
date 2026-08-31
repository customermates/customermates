"use client";

import type { AccountState } from "@/features/auth/account-state";

import { BookOpen, Boxes, CircleDollarSign, FileText, LogOut, Menu, Plug, UsersRound, X } from "lucide-react";
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
import {
  isPrimaryPublicNavLink,
  PublicNavLinkMark,
  PublicNavbarMenu,
  type PublicNavGroup,
} from "./navigation/public-navbar-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MarketingContainer } from "@/components/marketing/marketing-container";

type Props = {
  accountState: AccountState;
  hasValidSession: boolean;
};

const mobileOverviewRowClassName =
  "flex min-h-14 w-full items-center justify-between gap-4 rounded-md py-4 text-left text-base font-medium text-sidebar-foreground no-underline transition-all outline-none hover:no-underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50";

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
      activeHref: "/features",
      columns: 3,
      icon: Boxes,
      id: "product",
      links: [
        {
          href: "/features/unified-inbox",
          title: t("NavigationBar.public.unifiedInbox"),
        },
        {
          href: "/features/contact-management",
          title: t("NavigationBar.public.contactManagement"),
        },
        {
          href: "/features/pipeline",
          title: t("NavigationBar.public.pipeline"),
        },
        {
          href: "/features/sales-tracking",
          title: t("NavigationBar.public.salesTracking"),
        },
        {
          href: "/features/task-management",
          title: t("NavigationBar.public.taskManagement"),
        },
        {
          href: "/features/cloud-crm",
          title: t("NavigationBar.public.cloudCrm"),
        },
        {
          href: "/features/self-hosted",
          title: t("NavigationBar.public.selfHosted"),
        },
        {
          activeMatch: false,
          href: "/docs/mcp",
          title: t("NavigationBar.public.mcp"),
        },
        {
          href: "/features/all",
          title: t("NavigationBar.public.allFeatures"),
        },
      ],
      title: t("NavigationBar.public.product"),
    },
    {
      activeHref: "/for",
      columns: 3,
      icon: UsersRound,
      id: "solutions",
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
        {
          href: "/for/recruiting",
          title: t("NavigationBar.public.recruiting"),
        },
        {
          href: "/for/healthcare",
          title: t("NavigationBar.public.healthcare"),
        },
        {
          href: "/for/property-management",
          title: t("NavigationBar.public.propertyManagement"),
        },
        {
          href: "/for/startups",
          title: t("NavigationBar.public.startups"),
        },
        {
          href: "/for/smb",
          title: t("NavigationBar.public.smallBusiness"),
        },
        {
          href: "/for",
          title: t("NavigationBar.public.allSolutions"),
        },
      ],
      title: t("NavigationBar.public.solutions"),
    },
    {
      activeHref: "/features/integrations",
      columns: 2,
      icon: Plug,
      id: "integrations",
      links: [
        {
          activeMatch: false,
          href: "/docs/connect-custom-connector#claude",
          mark: { kind: "agent", provider: "claude" },
          title: t("NavigationBar.public.providerClaude"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-custom-connector#chatgpt",
          mark: { kind: "agent", provider: "chatgpt" },
          title: t("NavigationBar.public.providerChatGPT"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-cli#codex",
          mark: { kind: "agent", provider: "codex" },
          title: t("NavigationBar.public.providerCodex"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-cli#gemini-cli",
          mark: { kind: "agent", provider: "gemini" },
          title: t("NavigationBar.public.providerGemini"),
        },
        {
          activeMatch: false,
          href: "/docs/connect-cli#cursor",
          mark: { kind: "agent", provider: "cursor" },
          title: t("NavigationBar.public.providerCursor"),
        },
        {
          href: "/features/email-integration",
          mark: { kind: "channel", provider: "gmail" },
          title: t("NavigationBar.public.providerGmail"),
        },
        {
          href: "/features/outlook-integration",
          mark: { kind: "channel", provider: "outlook" },
          title: t("NavigationBar.public.providerOutlook"),
        },
        {
          href: "/features/linkedin-integration",
          mark: { kind: "channel", provider: "linkedin" },
          title: t("NavigationBar.public.providerLinkedIn"),
        },
        {
          activeMatch: false,
          href: "/features/unified-inbox",
          mark: { kind: "channel", provider: "whatsapp" },
          title: t("NavigationBar.public.providerWhatsApp"),
        },
        {
          activeMatch: false,
          href: "/features/unified-inbox",
          mark: { kind: "channel", provider: "instagram" },
          title: t("NavigationBar.public.providerInstagram"),
        },
        {
          activeMatch: false,
          href: "/features/unified-inbox",
          mark: { kind: "channel", provider: "telegram" },
          title: t("NavigationBar.public.providerTelegram"),
        },
        {
          href: "/features/email-integration",
          mark: { kind: "channel", provider: "imap" },
          title: t("NavigationBar.public.providerImap"),
        },
        {
          href: "/features/slack-integration",
          mark: { kind: "provider", provider: "slack" },
          title: t("NavigationBar.public.providerSlack"),
        },
        {
          href: "/n8n-crm",
          mark: { kind: "automation", provider: "n8n" },
          title: t("NavigationBar.public.n8n"),
        },
      ],
      title: t("NavigationBar.public.integrations"),
    },
    {
      activeHref: "/blog",
      columns: 2,
      icon: BookOpen,
      id: "resources",
      links: [
        {
          href: "/blog",
          title: t("NavigationBar.public.blog"),
        },
        { href: "/compare", title: t("NavigationBar.public.compare") },
        {
          href: "/blog/agentic-crm",
          title: t("NavigationBar.public.agenticCrm"),
        },
        {
          href: "/blog/open-source-crm",
          title: t("NavigationBar.public.openSourceCrm"),
        },
      ],
      title: t("NavigationBar.public.resources"),
    },
  ];

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

  function renderContactButton(className?: string, subtle = false) {
    if (!actions.showContact) return null;

    return (
      <Button asChild className={className} size="sm" variant={subtle ? "ghost" : "secondary"}>
        <IntlLink href="/contact" onNavigate={closeMenu}>
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
                <div className="w-full">
                  <Accordion collapsible className="w-full" type="single">
                    {publicNavGroups.map((group) => (
                      <AccordionItem key={group.id} value={group.id}>
                        <AccordionTrigger className={mobileOverviewRowClassName}>
                          <span className="flex items-center gap-2.5">
                            <Icon aria-hidden icon={group.icon} size="md" />

                            {group.title}
                          </span>
                        </AccordionTrigger>

                        <AccordionContent>
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
                                  {link.mark ? <PublicNavLinkMark mark={link.mark} /> : null}

                                  {link.title}
                                </AppLink>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>

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
});
