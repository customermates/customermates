"use client";

import { useLocale, useTranslations } from "next-intl";

import { FooterBadges } from "./footer-badges";

import { OPEN_PRIVACY_CHOICES_EVENT } from "@/components/acquisition/privacy-choices-event";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { AppImage } from "@/components/shared/app-image";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { isContentLocale } from "@/i18n/locale-registry";

type LinkItem = {
  displayName: string;
  slug: string;
};

type FooterProps = {
  blogPosts?: LinkItem[];
  className?: string;
  featureLinks?: LinkItem[];
  industries?: LinkItem[];
};

const FOOTER_LINK_CLASS = "text-subdued transition-colors hover:text-foreground focus-visible:text-foreground";

export function FooterContent({ blogPosts = [], className, featureLinks = [], industries = [] }: FooterProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { appMode } = useRootStore();

  return (
    <footer className={cn("mt-auto w-full border-t border-border bg-background text-sm", className)}>
      <MarketingContainer className="py-14 md:py-16">
        <div className="flex flex-col gap-8 border-b border-border pb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-5">
            <AppLink aria-label={`${t("Common.imageAlt.logo")} ${t("UserAvatar.home")}`} href="/">
              <AppImage
                alt={t("Common.imageAlt.logo")}
                className="h-[18px] w-auto"
                height={23}
                src="customermates.svg"
                width={229}
              />

              <span className="sr-only">{`${t("Common.imageAlt.logo")} ${t("UserAvatar.home")}`}</span>
            </AppLink>

            <div className="flex items-center gap-2">
              <a
                aria-label="GitHub"
                className="inline-flex size-9 items-center justify-center rounded-full border border-border text-subdued transition-colors hover:border-border-strong hover:text-foreground"
                href="https://github.com/customermates/customermates"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>

              <a
                aria-label="LinkedIn"
                className="inline-flex size-9 items-center justify-center rounded-full border border-border text-subdued transition-colors hover:border-border-strong hover:text-foreground"
                href="https://www.linkedin.com/company/customermates/"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0zM7.119 20.452H3.555V9h3.564v11.452zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.919-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zM20.447 20.452h-3.554V14.87c0-1.33-.027-3.041-1.852-3.041-1.853 0-2.136 1.445-2.136 2.944v5.679H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.367-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286z" />
                </svg>
              </a>

              <a
                aria-label="X (Twitter)"
                className="inline-flex size-9 items-center justify-center rounded-full border border-border text-subdued transition-colors hover:border-border-strong hover:text-foreground"
                href="https://x.com/benjiwagn"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          <nav aria-label={t("Footer.company")} className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/contact">
              {t("Common.actions.contact")}
            </AppLink>

            <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/affiliate">
              {t("NavigationBar.affiliate")} (35%)
            </AppLink>
          </nav>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.product")}</h3>

            <ul className="space-y-2.5">
              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/features">
                  {t("NavigationBar.features")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/pricing">
                  {t("NavigationBar.pricing")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/auth/signup">
                  {t("HomepagePricing.cloud.ctaText")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.features")}</h3>

            <ul className="space-y-2.5">
              {featureLinks.map(({ slug, displayName }) => (
                <li key={slug}>
                  <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href={`/features/${slug}`}>
                    {displayName}
                  </AppLink>
                </li>
              ))}

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/features/all">
                  {t("Footer.featuresViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.solutions")}</h3>

            <ul className="space-y-2.5">
              {industries.map(({ slug, displayName }) => (
                <li key={slug}>
                  <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href={`/for/${slug}`}>
                    {displayName}
                  </AppLink>
                </li>
              ))}

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/for">
                  {t("Footer.solutionsViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("NavigationBar.public.integrations")}</h3>

            <ul className="space-y-2.5">
              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/features/integrations">
                  {t("NavigationBar.public.allIntegrations")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/features/linkedin-integration">
                  {t("NavigationBar.public.providerLinkedIn")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/features/outlook-integration">
                  {t("NavigationBar.public.providerOutlook")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/features/email-integration">
                  {t("NavigationBar.public.emailAndGmail")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/features/slack-integration">
                  {t("NavigationBar.public.providerSlack")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/n8n-crm">
                  {t("NavigationBar.public.n8n")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.resources")}</h3>

            <ul className="space-y-2.5">
              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/docs">
                  {t("NavigationBar.docs")}
                </AppLink>
              </li>

              {blogPosts.map(({ slug, displayName }) => {
                const label =
                  slug === "agentic-crm"
                    ? t("NavigationBar.public.agenticCrm")
                    : slug === "open-source-crm"
                      ? t("NavigationBar.public.openSourceCrm")
                      : displayName;

                return (
                  <li key={slug}>
                    <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href={`/blog/${slug}`}>
                      {label}
                    </AppLink>
                  </li>
                );
              })}

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/blog">
                  {t("NavigationBar.public.articlesAndGuides")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/compare">
                  {t("NavigationBar.public.compare")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.legal")}</h3>

            <ul className="space-y-2.5">
              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/help-and-feedback">
                  {t("Footer.helpAndFeedback")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/imprint">
                  {t("Footer.imprint")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/privacy">
                  {t("Footer.privacy")}
                </AppLink>
              </li>

              {appMode === "cloud" && isContentLocale(locale) ? (
                <li>
                  <button
                    className={FOOTER_LINK_CLASS}
                    type="button"
                    onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT))}
                  >
                    {t("Footer.privacyChoices")}
                  </button>
                </li>
              ) : null}

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/terms">
                  {t("Footer.terms")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/subprocessors">
                  {t("Footer.subprocessors")}
                </AppLink>
              </li>

              <li>
                <AppLink appearance="unstyled" className={FOOTER_LINK_CLASS} href="/dpa">
                  {t("Footer.dpa")}
                </AppLink>
              </li>
            </ul>
          </div>
        </div>

        <FooterBadges />

        <div className="border-t border-border pt-8 text-center text-xs text-subdued">
          <p>{t("Footer.copyrightText", { year: new Date().getFullYear() })}</p>

          <ul className="mt-3 flex list-none flex-wrap justify-center gap-x-3 gap-y-2 p-0">
            <li>
              <a className={FOOTER_LINK_CLASS} href="https://viesearch.com/" rel="noopener noreferrer" target="_blank">
                Viesearch - The Human-curated Search Engine
              </a>
            </li>

            <li>
              <a
                className={FOOTER_LINK_CLASS}
                href="https://www.promotebusinessdirectory.com/"
                rel="noopener noreferrer"
                target="_blank"
              >
                https://www.promotebusinessdirectory.com/
              </a>
            </li>

            <li>
              <a
                className={FOOTER_LINK_CLASS}
                href="http://www.usawebsitesdirectory.com/computers_and_internet/"
                rel="noopener noreferrer"
                target="_blank"
              >
                http://www.usawebsitesdirectory.com/computers_and_internet/
              </a>
            </li>

            <li>
              <a
                className={FOOTER_LINK_CLASS}
                href="https://www.bestsitesindex.com/submit.php"
                rel="noopener noreferrer"
                target="_blank"
              >
                https://www.bestsitesindex.com/submit.php
              </a>
            </li>
          </ul>
        </div>
      </MarketingContainer>
    </footer>
  );
}
