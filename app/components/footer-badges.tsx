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
    light: "/images/badges/uneed-light.png",
    dark: "/images/badges/uneed-dark.png",
    width: 140,
    height: 54,
  },
  {
    name: "sourceforge",
    href: "https://sourceforge.net/software/product/Customermates/?pk_campaign=badge&pk_source=vendor",
    alt: "Customermates Reviews on SourceForge",
    light: "/images/badges/sourceforge-light.svg",
    dark: "/images/badges/sourceforge-dark.svg",
    width: 124,
    height: 143,
  },
  {
    name: "twelve-tools",
    href: "https://twelve.tools",
    alt: "Featured on Twelve Tools",
    light: "/images/badges/twelve-tools-light.svg",
    dark: "/images/badges/twelve-tools-dark.svg",
    width: 200,
    height: 54,
  },
  {
    name: "wired-business",
    href: "https://wired.business",
    alt: "Featured on Wired Business",
    light: "/images/badges/wired-business-light.svg",
    dark: "/images/badges/wired-business-dark.svg",
    width: 200,
    height: 54,
  },
  {
    name: "startup-fame",
    href: "https://startupfa.me/s/customermates?utm_source=customermates.com",
    alt: "Customermates - Featured on Startup Fame",
    light: "/images/badges/startup-fame-light.webp",
    dark: "/images/badges/startup-fame-dark.webp",
    width: 171,
    height: 54,
  },
  {
    name: "open-launch",
    href: "https://open-launch.com/projects/customermates",
    alt: "Featured on Open-Launch",
    light: "/images/badges/open-launch-light.svg",
    dark: "/images/badges/open-launch-dark.svg",
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
      className="shrink-0 opacity-70 grayscale transition-[opacity,filter] duration-200 hover:opacity-100 hover:grayscale-0"
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
