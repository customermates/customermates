import type { ClipTerminal } from "@/core/fumadocs/schemas/homepage";

import { getTranslations } from "next-intl/server";

import { HomepageClipTerminal } from "./homepage-clip-terminal";

type Step = { n: string; title: string; description: string };

type Props = {
  eyebrow: string;
  title: string;
  steps: Step[];
  clipTerminal: ClipTerminal;
};

export async function HomepageHowItWorks({ eyebrow, title, steps, clipTerminal }: Props) {
  const t = await getTranslations();

  return (
    <section
      className="w-full border-b border-foreground/15 py-20 sm:py-24 lg:py-32"
      data-homepage-section="how-it-works"
    >
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(180px,0.45fr)_minmax(0,1.55fr)] lg:gap-12">
          <p className="pt-1 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</p>

          <h2 className="m-0 max-w-[980px] text-[clamp(2.5rem,5.2vw,5.25rem)] font-medium leading-[0.98] tracking-[-0.05em] text-balance">
            {title}
          </h2>
        </div>

        <div className="mt-12 grid gap-12 lg:mt-20 lg:grid-cols-2 lg:items-start lg:gap-16">
          <ol className="border-t border-foreground/20">
            {steps.map((step) => (
              <li
                key={step.n}
                className="grid grid-cols-[56px_minmax(0,1fr)] gap-4 border-b border-foreground/20 py-7 sm:grid-cols-[76px_minmax(0,1fr)] sm:gap-6 sm:py-9"
              >
                <span className="font-mono text-sm text-muted-foreground">{step.n}</span>

                <div>
                  <h3 className="text-xl font-medium leading-tight tracking-[-0.025em] sm:text-2xl">{step.title}</h3>

                  <p className="mt-3 max-w-[620px] text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="lg:sticky lg:top-24">
            <HomepageClipTerminal strings={clipTerminal} />

            <div className="mt-3 flex items-center justify-between gap-4 px-1 font-mono text-[11px] text-muted-foreground">
              <span>{t("HomepageHowItWorks.loopCaption")}</span>

              <span>{t("HomepageHowItWorks.tailCaption")}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
