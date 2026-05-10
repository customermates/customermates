"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { useServerTheme } from "@/components/server-theme-provider";

type Badge = {
  name: string;
  href: string;
  alt: string;
  light: string;
  dark: string;
  width: number;
  height: number;
};

const BADGES: Badge[] = [
  {
    name: "uneed",
    href: "https://www.uneed.best/tool/customermates",
    alt: "Featured on Uneed",
    light: "https://www.uneed.best/POTW1.png",
    dark: "https://www.uneed.best/POTW1A.png",
    width: 140,
    height: 54,
  },
  {
    name: "sourceforge",
    href: "https://sourceforge.net/software/product/Customermates/?pk_campaign=badge&pk_source=vendor",
    alt: "Customermates Reviews on SourceForge",
    light: "https://b.sf-syn.com/badge_img/3954503/light-default?variant_id=sf",
    dark: "https://b.sf-syn.com/badge_img/3954503/dark-default?variant_id=sf",
    width: 124,
    height: 143,
  },
  {
    name: "twelve-tools",
    href: "https://twelve.tools",
    alt: "Featured on Twelve Tools",
    light: "https://twelve.tools/badge2-light.svg",
    dark: "https://twelve.tools/badge2-dark.svg",
    width: 200,
    height: 54,
  },
  {
    name: "wired-business",
    href: "https://wired.business",
    alt: "Featured on Wired Business",
    light: "https://wired.business/badge1-light.svg",
    dark: "https://wired.business/badge1-dark.svg",
    width: 200,
    height: 54,
  },
  {
    name: "startup-fame",
    href: "https://startupfa.me/s/customermates?utm_source=customermates.com",
    alt: "Customermates - Featured on Startup Fame",
    light: "https://startupfa.me/badges/featured/light.webp",
    dark: "https://startupfa.me/badges/featured/dark.webp",
    width: 171,
    height: 54,
  },
  {
    name: "open-launch",
    href: "https://open-launch.com/projects/customermates",
    alt: "Featured on Open-Launch",
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

type BadgeLinkProps = { badge: Badge; isDark: boolean; ariaHidden?: boolean };

function BadgeLink({ badge, isDark, ariaHidden }: BadgeLinkProps) {
  return (
    <a
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : badge.alt}
      className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
      href={badge.href}
      rel="noopener noreferrer"
      tabIndex={ariaHidden ? -1 : undefined}
      target="_blank"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={ariaHidden ? "" : badge.alt}
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
        <p className="mb-5 text-center text-xs uppercase tracking-[0.2em] text-subdued">Featured on</p>

        <div className="footer-badges-mask overflow-hidden">
          <div className="footer-badges-track flex w-max items-center gap-10 animate-[footer-badges-marquee_25s_linear_infinite] hover:[animation-play-state:paused]">
            {Array.from({ length: MARQUEE_COPIES }).flatMap((_, copyIndex) =>
              BADGES.map((badge) => (
                <BadgeLink
                  key={`${copyIndex}-${badge.name}`}
                  ariaHidden={copyIndex > 0}
                  badge={badge}
                  isDark={isDark}
                />
              )),
            )}
          </div>
        </div>
      </div>
    </>
  );
}
