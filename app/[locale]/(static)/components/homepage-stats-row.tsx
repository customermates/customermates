import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { MarketingContainer } from "@/components/marketing/marketing-container";

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
        <circle cx="5" cy="12" fill="#EA4B71" r="2" />

        <circle cx="19" cy="7" fill="#EA4B71" r="2" />

        <circle cx="19" cy="17" fill="#EA4B71" r="2" />

        <circle cx="12" cy="12" fill="#EA4B71" r="2.5" />

        <path d="M7 12h3M14 12l3-4M14 12l3 4" stroke="#EA4B71" strokeWidth="1.5" />
      </svg>
    ),
  },
];

export async function HomepageStatsRow() {
  const t = await getTranslations();

  return (
    <section className="marketing-section-flush border-b border-border py-10 sm:py-12 lg:py-14">
      <MarketingContainer>
        <div>
          {/* eslint-disable react/jsx-newline */}
          <p className="text-meta mb-4 text-center">
            {t("HomepageStatsRow.taglinePre")}{" "}
            <span className="font-medium text-foreground">{t("HomepageStatsRow.taglineMcp")}</span>
            {t("HomepageStatsRow.taglinePost")}
          </p>
          {/* eslint-enable react/jsx-newline */}

          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {LOGOS.map((logo) => (
              <div key={logo.name} className="flex items-center gap-2">
                {logo.mark}

                <span className="text-sm font-medium tracking-tight">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
