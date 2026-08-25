"use client";

import { useLocale, useTranslations } from "next-intl";

import { CompetitorLinks } from "./competitor-links";
import { FooterBadges } from "./footer-badges";

import { AppLink } from "@/components/shared/app-link";
import { AppImage } from "@/components/shared/app-image";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { CONTENT_LOCALES, buildLocalePath, contentLocaleOrDefault } from "@/i18n/locale-registry";
import { usePathname } from "@/i18n/navigation";

type LinkItem = {
  slug: string;
  displayName: string;
};

type FooterProps = {
  blogPosts?: LinkItem[];
  competitors?: LinkItem[];
  featureLinks?: LinkItem[];
  industries?: LinkItem[];
};

export function FooterContent({ blogPosts = [], competitors = [], featureLinks = [], industries = [] }: FooterProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const activeLocale = contentLocaleOrDefault(useLocale());

  return (
    <footer className="bg-muted mt-auto w-full text-x-sm">
      <div className="max-w-[1300px] mx-auto px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-8 mb-12">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 flex flex-col items-start gap-4">
            <AppLink aria-label={`${t("Common.imageAlt.logo")} ${t("UserAvatar.home")}`} href="/">
              <AppImage alt={t("Common.imageAlt.logo")} height={27} src="customermates.svg" width={156} />

              <span className="sr-only">{`${t("Common.imageAlt.logo")} ${t("UserAvatar.home")}`}</span>
            </AppLink>

            <div className="flex gap-4">
              <a
                className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors inline-flex items-center gap-1.5"
                href="https://github.com/customermates/customermates"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>

                <span className="sr-only">GitHub</span>
              </a>

              <a
                className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors inline-flex items-center gap-1.5"
                href="https://www.linkedin.com/company/customermates/"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0zM7.119 20.452H3.555V9h3.564v11.452zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.919-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zM20.447 20.452h-3.554V14.87c0-1.33-.027-3.041-1.852-3.041-1.853 0-2.136 1.445-2.136 2.944v5.679H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.367-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286z" />
                </svg>

                <span className="sr-only">LinkedIn</span>
              </a>

              <a
                className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors inline-flex items-center gap-1.5"
                href="https://x.com/benjiwagn"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>

                <span className="sr-only">X (Twitter)</span>
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.product")}</h3>

            <ul className="space-y-2">
              <li>
                <AppLink className="text-subdued" href="/pricing">
                  {t("NavigationBar.pricing")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/features">
                  {t("NavigationBar.features")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/n8n-crm">
                  {t("NavigationBar.automation")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/docs">
                  {t("NavigationBar.docs")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/affiliate">
                  {t("NavigationBar.affiliate")} (35%)
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.features")}</h3>

            <ul className="space-y-2">
              {featureLinks.map(({ slug, displayName }) => (
                <li key={slug}>
                  <AppLink className="text-subdued" href={`/features/${slug}`}>
                    {displayName}
                  </AppLink>
                </li>
              ))}

              <li>
                <AppLink className="text-subdued" href="/features/all">
                  {t("Footer.featuresViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.solutions")}</h3>

            <ul className="space-y-2">
              {industries.map(({ slug, displayName }) => (
                <li key={slug}>
                  <AppLink className="text-subdued" href={`/for/${slug}`}>
                    {displayName}
                  </AppLink>
                </li>
              ))}

              <li>
                <AppLink className="text-subdued" href="/for">
                  {t("Footer.solutionsViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.compare")}</h3>

            <ul className="space-y-2">
              <CompetitorLinks competitors={competitors} />

              <li>
                <AppLink className="text-subdued" href="/compare">
                  {t("Footer.compareViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.resources")}</h3>

            <ul className="space-y-2">
              {blogPosts.map(({ slug, displayName }) => (
                <li key={slug}>
                  <AppLink className="text-subdued line-clamp-1" href={`/blog/${slug}`}>
                    {displayName}
                  </AppLink>
                </li>
              ))}

              <li>
                <AppLink className="text-subdued" href="/blog">
                  {t("Footer.blogViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("Footer.legal")}</h3>

            <ul className="space-y-2">
              <li>
                <AppLink className="text-subdued" href="/help-and-feedback">
                  {t("Footer.helpAndFeedback")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/imprint">
                  {t("Footer.imprint")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/privacy">
                  {t("Footer.privacy")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/terms">
                  {t("Footer.terms")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/subprocessors">
                  {t("Footer.subprocessors")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/dpa">
                  {t("Footer.dpa")}
                </AppLink>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 pt-8">
          <nav aria-label={t("Common.language")} className="flex items-center gap-1">
            {CONTENT_LOCALES.map((locale) => (
              <Button
                key={locale}
                asChild
                className={cn(
                  "size-8 rounded-md p-0 text-subdued hover:text-foreground",
                  locale === activeLocale && "text-foreground",
                )}
                size="icon-sm"
                variant="ghost"
              >
                <a
                  aria-current={locale === activeLocale ? "true" : undefined}
                  aria-label={t(`Common.locales.${locale}`)}
                  href={buildLocalePath(locale, pathname)}
                  hrefLang={locale}
                >
                  <span aria-hidden>{locale.toUpperCase()}</span>
                </a>
              </Button>
            ))}
          </nav>

          <ThemeSwitcher />
        </div>

        <FooterBadges />

        <div className="pt-8 text-center text-xs text-subdued">
          <span>{t("Footer.copyrightText", { year: new Date().getFullYear() })}</span>

          {" · "}

          <a
            className="transition-colors hover:text-foreground"
            href="https://viesearch.com/"
            rel="noopener noreferrer"
            target="_blank"
          >
            Viesearch - The Human-curated Search Engine
          </a>

          {" · "}

          <a
            className="transition-colors hover:text-foreground"
            href="https://www.promotebusinessdirectory.com/"
            rel="noopener noreferrer"
            target="_blank"
          >
            https://www.promotebusinessdirectory.com/
          </a>

          {" · "}

          <a
            className="transition-colors hover:text-foreground"
            href="http://www.usawebsitesdirectory.com/computers_and_internet/"
            rel="noopener noreferrer"
            target="_blank"
          >
            http://www.usawebsitesdirectory.com/computers_and_internet/
          </a>

          {" · "}

          <a
            className="transition-colors hover:text-foreground"
            href="https://www.bestsitesindex.com/submit.php"
            rel="noopener noreferrer"
            target="_blank"
          >
            https://www.bestsitesindex.com/submit.php
          </a>
        </div>
      </div>
    </footer>
  );
}
