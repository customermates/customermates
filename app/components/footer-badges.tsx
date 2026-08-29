"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

type Badge = {
  href: string;
  kind: "featured" | "reviews";
  monogram: string;
  name: string;
  platform: string;
};

const BADGES: Badge[] = [
  {
    name: "uneed",
    platform: "Uneed",
    monogram: "U",
    kind: "featured",
    href: "https://www.uneed.best/tool/customermates",
  },
  {
    name: "sourceforge",
    platform: "SourceForge",
    monogram: "SF",
    kind: "reviews",
    href: "https://sourceforge.net/software/product/Customermates/?pk_campaign=badge&pk_source=vendor",
  },
  {
    name: "twelve-tools",
    platform: "Twelve Tools",
    monogram: "12",
    kind: "featured",
    href: "https://twelve.tools",
  },
  {
    name: "wired-business",
    platform: "Wired Business",
    monogram: "WB",
    kind: "featured",
    href: "https://wired.business",
  },
  {
    name: "startup-fame",
    platform: "Startup Fame",
    monogram: "SF",
    kind: "featured",
    href: "https://startupfa.me/s/customermates?utm_source=customermates.com",
  },
  {
    name: "open-launch",
    platform: "Open-Launch",
    monogram: "OL",
    kind: "featured",
    href: "https://open-launch.com/projects/customermates",
  },
];

export function FooterBadges() {
  const t = useTranslations();

  return (
    <div className="border-t border-border pt-8">
      <p className="mb-5 text-center text-xs uppercase tracking-[0.2em] text-subdued">{t("Footer.featuredOn")}</p>

      <div className="grid grid-cols-2 border-t border-l border-border sm:grid-cols-3 xl:grid-cols-6">
        {BADGES.map((badge) => {
          const label =
            badge.kind === "reviews"
              ? t("Footer.reviewsOnPlatform", { platform: badge.platform })
              : t("Footer.featuredOnPlatform", { platform: badge.platform });

          return (
            <a
              key={badge.name}
              aria-label={label}
              className="group flex min-h-24 items-center justify-between gap-4 border-r border-b border-border px-4 py-5 text-subdued transition-colors hover:bg-sidebar/60 hover:text-foreground focus-visible:bg-sidebar/60 focus-visible:text-foreground"
              href={badge.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center border border-border-strong bg-background font-mono text-[11px] font-semibold tracking-tight text-foreground">
                  {badge.monogram}
                </span>

                <span className="truncate text-sm font-medium text-foreground/85">{badge.platform}</span>
              </span>

              <ArrowUpRight
                aria-hidden
                className="size-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}
