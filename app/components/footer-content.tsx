"use client";

import { useTranslations } from "next-intl";

import { CompetitorLinks } from "./competitor-links";
import { FooterBadges } from "./footer-badges";

import { LanguageSelector } from "@/components/shared/language-selector";
import { AppLink } from "@/components/shared/app-link";
import { AppImage } from "@/components/shared/app-image";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";

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
  const t = useTranslations("Footer");
  const tNav = useTranslations("NavigationBar");

  const tCommon = useTranslations("Common");
  const tUserAvatar = useTranslations("UserAvatar");

  return (
    <footer className="bg-muted dark:bg-card mt-auto w-full text-x-sm">
      <div className="max-w-[1300px] mx-auto px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-8 mb-12">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 flex flex-col items-start gap-4">
            <AppLink aria-label={`${tCommon("imageAlt.logo")} ${tUserAvatar("home")}`} href="/">
              <AppImage alt={tCommon("imageAlt.logo")} height={27} src="customermates.svg" width={156} />

              <span className="sr-only">{`${tCommon("imageAlt.logo")} ${tUserAvatar("home")}`}</span>
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
            <h3 className="font-semibold text-foreground">{t("product")}</h3>

            <ul className="space-y-2">
              <li>
                <AppLink className="text-subdued" href="/pricing">
                  {tNav("pricing")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/features">
                  {tNav("features")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/n8n-crm">
                  {tNav("automation")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/docs">
                  {tNav("docs")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/affiliate">
                  {tNav("affiliate")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("features")}</h3>

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
                  {t("featuresViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("solutions")}</h3>

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
                  {t("solutionsViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("compare")}</h3>

            <ul className="space-y-2">
              <CompetitorLinks competitors={competitors} />

              <li>
                <AppLink className="text-subdued" href="/compare">
                  {t("compareViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("resources")}</h3>

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
                  {t("blogViewAll")}
                </AppLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("legal")}</h3>

            <ul className="space-y-2">
              <li>
                <AppLink className="text-subdued" href="/help-and-feedback">
                  {t("helpAndFeedback")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/imprint">
                  {t("imprint")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/privacy">
                  {t("privacy")}
                </AppLink>
              </li>

              <li>
                <AppLink className="text-subdued" href="/terms">
                  {t("terms")}
                </AppLink>
              </li>
            </ul>
          </div>
        </div>

        <FooterBadges />

        <div className="pt-8">
          <div className="flex flex-col md:flex-row items-center justify-center md:justify-between gap-3 md:gap-4">
            <div className="text-xs text-subdued text-center md:text-left">
              <span>{t("copyrightText", { year: new Date().getFullYear() })}</span>

              {" · "}

              <a
                className="hover:text-foreground transition-colors"
                href="https://viesearch.com/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Viesearch - The Human-curated Search Engine
              </a>

              {" · "}

              <a
                className="hover:text-foreground transition-colors"
                href="https://www.promotebusinessdirectory.com/"
                rel="noopener noreferrer"
                target="_blank"
              >
                https://www.promotebusinessdirectory.com/
              </a>

              {" · "}

              <a
                className="hover:text-foreground transition-colors"
                href="http://www.usawebsitesdirectory.com/computers_and_internet/"
                rel="noopener noreferrer"
                target="_blank"
              >
                http://www.usawebsitesdirectory.com/computers_and_internet/
              </a>

              {" · "}

              <a
                className="hover:text-foreground transition-colors"
                href="https://www.bestsitesindex.com/submit.php"
                rel="noopener noreferrer"
                target="_blank"
              >
                https://www.bestsitesindex.com/submit.php
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 md:gap-4">
              <LanguageSelector className="w-32" />

              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
