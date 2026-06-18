import type { ReactNode } from "react";

import { getTranslations } from "next-intl/server";

type Logo = { name: string; mark: ReactNode };

const LOGOS: Logo[] = [
  {
    name: "Claude",
    mark: (
      <svg aria-hidden fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M4.7 18.4 9.3 5.6h2.6l4.6 12.8h-2.5l-1-3H8.2l-1 3H4.7Zm4.1-5h4.4L11 7l-2.2 6.4Z" fill="#D97757" />

        <path d="M15.5 18.4h2.3l-3-7.4 3-5.4h-2.3l-3 5.4 3 7.4Z" fill="#D97757" />
      </svg>
    ),
  },
  {
    name: "ChatGPT",
    mark: (
      <svg aria-hidden fill="#10A37F" height="22" viewBox="0 0 24 24" width="22">
        <path d="M22.3 10a5.5 5.5 0 0 0-.5-4.5A5.6 5.6 0 0 0 15.7 3a5.6 5.6 0 0 0-4.3-2 5.6 5.6 0 0 0-5.4 3.9A5.6 5.6 0 0 0 2.3 7.6a5.6 5.6 0 0 0 .7 6.6 5.6 5.6 0 0 0 .5 4.5 5.6 5.6 0 0 0 6 2.7 5.6 5.6 0 0 0 4.3 1.9 5.6 5.6 0 0 0 5.4-3.9 5.6 5.6 0 0 0 3.7-2.7 5.6 5.6 0 0 0-.6-6.7ZM13.9 21.7a4.1 4.1 0 0 1-2.7-1l.1-.1 4.5-2.6a.7.7 0 0 0 .4-.7v-6.4l1.9 1.1v5.3a4.2 4.2 0 0 1-4.2 4.2Zm-9-3.8a4.1 4.1 0 0 1-.5-2.8l.1.1 4.5 2.6a.7.7 0 0 0 .8 0l5.5-3.2v2.2l-4.6 2.6a4.2 4.2 0 0 1-5.7-1.5ZM3.7 8.8a4.1 4.1 0 0 1 2.2-1.9v5.4a.7.7 0 0 0 .4.7l5.5 3.2-1.9 1.1-4.6-2.6a4.2 4.2 0 0 1-1.6-5.9Zm15.6 3.6-5.5-3.2 1.9-1.1 4.6 2.6a4.2 4.2 0 0 1-.6 7.7v-5.4a.7.7 0 0 0-.4-.6Zm1.9-2.8-.1-.1-4.5-2.6a.7.7 0 0 0-.8 0L10.3 10V7.8l4.6-2.6a4.2 4.2 0 0 1 6.2 4.4ZM9.3 13.6l-1.9-1.1V7.3a4.2 4.2 0 0 1 6.9-3.2l-.1.1-4.5 2.6a.7.7 0 0 0-.4.7v6.1Zm1-2.2L12.8 10l2.5 1.4v2.9l-2.5 1.4L10.3 14.3v-2.9Z" />
      </svg>
    ),
  },
  {
    name: "Codex",
    mark: (
      <svg aria-hidden fill="none" height="22" viewBox="0 0 24 24" width="22">
        <rect fill="currentColor" height="16" rx="3" width="20" x="2" y="4" />

        <path d="M8 10l-2 2 2 2M16 10l2 2-2 2M13.5 9l-3 6" stroke="#fff" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    name: "Gemini",
    mark: (
      <svg aria-hidden fill="none" height="22" viewBox="0 0 24 24" width="22">
        <path d="M12 2c.5 4.5 3.5 7.5 8 8-4.5.5-7.5 3.5-8 8-.5-4.5-3.5-7.5-8-8 4.5-.5 7.5-3.5 8-8Z" fill="#4285F4" />
      </svg>
    ),
  },
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
