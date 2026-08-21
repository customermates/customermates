import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";

type Logo = { name: string; mark: ReactNode };

const LOGOS: Logo[] = [
  { name: "Claude", mark: <AiClientLogo provider="claude" /> },
  { name: "ChatGPT", mark: <AiClientLogo provider="chatgpt" /> },
  { name: "Codex", mark: <AiClientLogo provider="codex" /> },
  { name: "Gemini", mark: <AiClientLogo provider="gemini" /> },
  {
    name: "n8n",
    mark: (
      <svg aria-hidden fill="none" height="22" viewBox="0 0 24 24" width="22">
        <circle cx="5" cy="12" fill="currentColor" r="2" />

        <circle cx="19" cy="7" fill="currentColor" r="2" />

        <circle cx="19" cy="17" fill="currentColor" r="2" />

        <circle cx="12" cy="12" fill="currentColor" r="2.5" />

        <path d="M7 12h3M14 12l3-4M14 12l3 4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

export async function HomepageStatsRow() {
  const t = await getTranslations();

  return (
    <section className="w-full border-b border-foreground/15" data-homepage-section="clients">
      <div className="mx-auto grid w-full max-w-[1440px] gap-8 px-5 py-8 sm:px-8 md:grid-cols-[minmax(220px,0.65fr)_minmax(0,1.35fr)] md:items-center md:py-10">
        {/* eslint-disable react/jsx-newline */}
        <p className="max-w-[360px] text-sm leading-relaxed text-muted-foreground">
          {t("HomepageStatsRow.taglinePre")}{" "}
          <span className="font-medium text-foreground">{t("HomepageStatsRow.taglineMcp")}</span>
          {t("HomepageStatsRow.taglinePost")}
        </p>
        {/* eslint-enable react/jsx-newline */}

        <ul className="flex flex-wrap items-center gap-x-8 gap-y-5 md:justify-end lg:gap-x-12">
          {LOGOS.map((logo) => (
            <li key={logo.name} className="flex items-center gap-2.5 text-foreground/80 grayscale">
              {logo.mark}

              <span className="text-sm font-medium tracking-[-0.015em]">{logo.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
