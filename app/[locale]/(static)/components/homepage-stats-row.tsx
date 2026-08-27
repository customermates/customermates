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
    <div className="mx-auto -mt-5 w-full max-w-[1100px] px-4">
      <div className="relative overflow-hidden rounded-2xl px-6 py-7 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background:radial-gradient(ellipse_at_15%_50%,rgba(94,74,227,0.10),transparent_55%),radial-gradient(ellipse_at_85%_50%,rgba(18,148,144,0.08),transparent_55%)]"
        />

        <div className="relative">
          {/* eslint-disable react/jsx-newline */}
          <p className="mb-4 text-xs tracking-wide text-muted-foreground">
            {t("HomepageStatsRow.taglinePre")}{" "}
            <span className="font-medium text-foreground">{t("HomepageStatsRow.taglineMcp")}</span>
            {t("HomepageStatsRow.taglinePost")}
          </p>
          {/* eslint-enable react/jsx-newline */}

          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {LOGOS.map((logo) => (
              <div key={logo.name} className="flex items-center gap-2 text-foreground/80">
                {logo.mark}

                <span className="text-[15px] font-semibold tracking-tight">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
