"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { CompetitorLinks } from "./competitor-links";

import { useServerTheme } from "@/components/server-theme-provider";
import { XLanguageSelector } from "@/components/x-language-selector";
import { XLink } from "@/components/x-link";
import { XImage } from "@/components/x-image";
import { XThemeSwitcher } from "@/components/x-theme-switcher";

type CompetitorLink = {
  slug: string;
  displayName: string;
};

type FooterProps = {
  competitors?: CompetitorLink[];
};

function UneedBadge() {
  const serverTheme = useServerTheme();
  const { resolvedTheme, systemTheme } = useTheme();
  const [isDark, setIsDark] = useState(serverTheme === "dark");

  useEffect(() => {
    const theme = resolvedTheme === "system" ? systemTheme : resolvedTheme;
    setIsDark(theme === "dark");
  }, [resolvedTheme, systemTheme]);

  const badgeSrc = isDark ? "https://www.uneed.best/POTW1A.png" : "https://www.uneed.best/POTW1.png";

  return (
    <a
      aria-label="Featured on Uneed"
      href="https://www.uneed.best/tool/customermates"
      rel="noopener noreferrer"
      target="_blank"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Featured on Uneed" height="54" loading="eager" src={badgeSrc} width="140" />
    </a>
  );
}

export function FooterContent({ competitors = [] }: FooterProps) {
  const t = useTranslations("Footer");
  const tNav = useTranslations("NavigationBar");
  const tCommon = useTranslations("Common");
  const tUserAvatar = useTranslations("UserAvatar");

  return (
    <footer className="border-t border-divider bg-content2 dark:bg-content1 mt-auto w-full text-x-sm">
      <div className="max-w-[1300px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-6">
            <XLink aria-label={`${tCommon("imageAlt.logo")} ${tUserAvatar("home")}`} href="/">
              <XImage alt={tCommon("imageAlt.logo")} height={27} src="customermates.svg" width={156} />

              <span className="sr-only">{`${tCommon("imageAlt.logo")} ${tUserAvatar("home")}`}</span>
            </XLink>

            <UneedBadge />

            <div className="flex gap-4 mt-4">
              <a
                aria-label="GitHub"
                className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                href="https://github.com/customermates"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>

              <a
                aria-label="LinkedIn"
                className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                href="https://www.linkedin.com/company/customermates/"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0zM7.119 20.452H3.555V9h3.564v11.452zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.919-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zM20.447 20.452h-3.554V14.87c0-1.33-.027-3.041-1.852-3.041-1.853 0-2.136 1.445-2.136 2.944v5.679H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.367-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286z" />
                </svg>
              </a>

              <a
                aria-label="Twitter"
                className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                href="https://x.com/benjiwagn"
                rel="noopener noreferrer"
                target="_blank"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("product")}</h3>

            <ul className="space-y-2">
              <li>
                <XLink className="text-subdued" href="/pricing">
                  {tNav("pricing")}
                </XLink>
              </li>

              <li>
                <XLink className="text-subdued" href="/features">
                  {tNav("features")}
                </XLink>
              </li>

              <li>
                <XLink className="text-subdued" href="/n8n-crm">
                  {tNav("automation")}
                </XLink>
              </li>

              <li>
                <XLink className="text-subdued" href="/docs">
                  {tNav("docs")}
                </XLink>
              </li>

              <li>
                <XLink className="text-subdued" href="/blog">
                  {tNav("blog")}
                </XLink>
              </li>

              <li>
                <XLink className="text-subdued" href="/affiliate">
                  {tNav("affiliate")}
                </XLink>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("resources")}</h3>

            <ul className="space-y-2">
              <li>
                <XLink className="text-subdued" href="/help-and-feedback">
                  {t("helpAndFeedback")}
                </XLink>
              </li>

              <CompetitorLinks competitors={competitors} />
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">{t("legal")}</h3>

            <ul className="space-y-2">
              <li>
                <XLink className="text-subdued" href="/imprint">
                  {t("imprint")}
                </XLink>
              </li>

              <li>
                <XLink className="text-subdued" href="/privacy">
                  {t("privacy")}
                </XLink>
              </li>

              <li>
                <XLink className="text-subdued" href="/terms">
                  {t("terms")}
                </XLink>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-divider">
          <div className="flex flex-col md:flex-row items-center justify-center md:justify-between gap-3 md:gap-4">
            <div className="text-subdued text-center md:text-left">
              {t("copyrightText", { year: new Date().getFullYear() })}
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 md:gap-4">
              <XLanguageSelector className="w-32" />

              <XThemeSwitcher />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
