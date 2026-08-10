"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { useServerTheme } from "@/components/server-theme-provider";

type Badge = {
  name: string;
  platform: string;
  kind: "featured" | "reviews";
  href: string;
  light: string;
  dark: string;
  width: number;
  height: number;
};

const BADGES: Badge[] = [
  {
    name: "uneed",
    platform: "Uneed",
    kind: "featured",
    href: "https://www.uneed.best/tool/customermates",
    light: "https://www.uneed.best/POTW1.png",
    dark: "https://www.uneed.best/POTW1A.png",
    width: 140,
    height: 54,
  },
  {
    name: "sourceforge",
    platform: "SourceForge",
    kind: "reviews",
    href: "https://sourceforge.net/software/product/Customermates/?pk_campaign=badge&pk_source=vendor",
    light: "https://b.sf-syn.com/badge_img/3954503/light-default?variant_id=sf",
    dark: "https://b.sf-syn.com/badge_img/3954503/dark-default?variant_id=sf",
    width: 124,
    height: 143,
  },
  {
    name: "twelve-tools",
    platform: "Twelve Tools",
    kind: "featured",
    href: "https://twelve.tools",
    light: "https://twelve.tools/badge2-light.svg",
    dark: "https://twelve.tools/badge2-dark.svg",
    width: 200,
    height: 54,
  },
  {
    name: "wired-business",
    platform: "Wired Business",
    kind: "featured",
    href: "https://wired.business",
    light: "https://wired.business/badge1-light.svg",
    dark: "https://wired.business/badge1-dark.svg",
    width: 200,
    height: 54,
  },
  {
    name: "startup-fame",
    platform: "Startup Fame",
    kind: "featured",
    href: "https://startupfa.me/s/customermates?utm_source=customermates.com",
    light: "https://startupfa.me/badges/featured/light.webp",
    dark: "https://startupfa.me/badges/featured/dark.webp",
    width: 171,
    height: 54,
  },
  {
    name: "open-launch",
    platform: "Open-Launch",
    kind: "featured",
    href: "https://open-launch.com/projects/customermates",
    light: "https://open-launch.com/api/badge/e6753e76-e978-4100-b29f-a3048622b9a6/featured-light.svg",
    dark: "https://open-launch.com/api/badge/e6753e76-e978-4100-b29f-a3048622b9a6/featured-dark.svg",
    width: 200,
    height: 50,
  },
];

const MARQUEE_GAP_REM = 2.5;
const MARQUEE_COPIES = 4;

const MARQUEE_STYLES = `
@keyframes footer-badges-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(calc(-${100 / MARQUEE_COPIES}% - ${MARQUEE_GAP_REM / MARQUEE_COPIES}rem)); }
}
.footer-badges-mask {
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%);
  mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%);
}
@media (prefers-reduced-motion: reduce) {
  .footer-badges-track { animation: none !important; }
}
`;

type BadgeLinkProps = {
  badge: Badge;
  isDark: boolean;
  label: string;
  ariaHidden?: boolean;
};

function BadgeLink({ badge, isDark, label, ariaHidden }: BadgeLinkProps) {
  return (
    <a
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : label}
      className="shrink-0 opacity-70 grayscale transition-[opacity,filter] duration-200 hover:opacity-100 hover:grayscale-0"
      href={badge.href}
      rel="noopener noreferrer"
      tabIndex={ariaHidden ? -1 : undefined}
      target="_blank"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={ariaHidden ? "" : label}
        className="h-8 w-auto"
        height={badge.height}
        loading="lazy"
        src={isDark ? badge.dark : badge.light}
        width={badge.width}
      />
    </a>
  );
}

export function FooterBadges() {
  const t = useTranslations();
  const serverTheme = useServerTheme();
  const { resolvedTheme, systemTheme } = useTheme();
  const [isDark, setIsDark] = useState(serverTheme === "dark");

  useEffect(() => {
    const theme = resolvedTheme === "system" ? systemTheme : resolvedTheme;
    setIsDark(theme === "dark");
  }, [resolvedTheme, systemTheme]);

  return (
    <>
      <style>{MARQUEE_STYLES}</style>

      <div className="border-t border-border pt-6 pb-4">
        <p className="mb-5 text-center text-xs uppercase tracking-[0.2em] text-subdued">{t("Footer.featuredOn")}</p>

        <div className="footer-badges-mask overflow-hidden">
          <div className="footer-badges-track flex w-max items-center gap-10 animate-[footer-badges-marquee_25s_linear_infinite] hover:[animation-play-state:paused]">
            {Array.from({ length: MARQUEE_COPIES }).flatMap((_, copyIndex) =>
              BADGES.map((badge) => {
                const label =
                  badge.kind === "reviews"
                    ? t("Footer.reviewsOnPlatform", { platform: badge.platform })
                    : t("Footer.featuredOnPlatform", { platform: badge.platform });

                return (
                  <BadgeLink
                    key={`${copyIndex}-${badge.name}`}
                    ariaHidden={copyIndex > 0}
                    badge={badge}
                    isDark={isDark}
                    label={label}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>
    </>
  );
}
