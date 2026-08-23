import type { ClipTerminal } from "@/core/fumadocs/schemas/homepage";

import { getTranslations } from "next-intl/server";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageClipTerminal } from "./homepage-clip-terminal";

type Step = { n: string; title: string; description: string };

type Props = {
  title: string;
  steps: Step[];
  clipTerminal: ClipTerminal;
};

export async function HomepageHowItWorks({ title, steps, clipTerminal }: Props) {
  const t = await getTranslations();

  return (
    <MarketingSection id="how-it-works" title={title}>
      <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:mt-16 lg:grid-cols-2 lg:gap-14">
        <ol className="flex flex-col gap-5">
          {steps.map((step) => (
            <li key={step.n} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-sm font-medium">
                {step.n}
              </span>

              <div>
                <p className="font-medium">{step.title}</p>

                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div>
          <HomepageClipTerminal strings={clipTerminal} />

          <div className="text-meta mt-2.5 flex items-center justify-between px-1 font-mono">
            <span>{t("HomepageHowItWorks.loopCaption")}</span>

            <span>{t("HomepageHowItWorks.tailCaption")}</span>
          </div>
        </div>
      </div>
    </MarketingSection>
  );
}
