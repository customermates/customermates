"use client";

import { useTranslations } from "next-intl";

type Badge = {
  href: string;
  kind: "featured" | "reviews";
  name: string;
  platform: string;
};

const BADGES: Badge[] = [
  {
    name: "uneed",
    platform: "Uneed",
    kind: "featured",
    href: "https://www.uneed.best/tool/customermates",
  },
  {
    name: "sourceforge",
    platform: "SourceForge",
    kind: "reviews",
    href: "https://sourceforge.net/software/product/Customermates/?pk_campaign=badge&pk_source=vendor",
  },
  {
    name: "twelve-tools",
    platform: "Twelve Tools",
    kind: "featured",
    href: "https://twelve.tools",
  },
  {
    name: "wired-business",
    platform: "Wired Business",
    kind: "featured",
    href: "https://wired.business",
  },
  {
    name: "startup-fame",
    platform: "Startup Fame",
    kind: "featured",
    href: "https://startupfa.me/s/customermates?utm_source=customermates.com",
  },
  {
    name: "open-launch",
    platform: "Open-Launch",
    kind: "featured",
    href: "https://open-launch.com/projects/customermates",
  },
];

export function FooterBadges() {
  const t = useTranslations();

  return (
    <div className="border-t border-border py-8">
      <p className="mb-5 text-center text-xs uppercase tracking-[0.2em] text-subdued">{t("Footer.featuredOn")}</p>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {BADGES.map((badge) => {
          const label =
            badge.kind === "reviews"
              ? t("Footer.reviewsOnPlatform", { platform: badge.platform })
              : t("Footer.featuredOnPlatform", { platform: badge.platform });

          return (
            <a
              key={badge.name}
              aria-label={label}
              className="flex min-h-14 items-center justify-center bg-background px-3 text-center text-xs font-medium tracking-wide text-subdued transition-colors hover:text-foreground focus-visible:text-foreground"
              href={badge.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {badge.platform}
            </a>
          );
        })}
      </div>
    </div>
  );
}
