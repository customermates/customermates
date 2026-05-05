import type { ClipTerminal } from "@/core/fumadocs/schemas/homepage";

import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";

import { HomepageClipTerminal } from "./homepage-clip-terminal";

type Step = { n: string; title: string; description: string };

type Props = {
  eyebrow: string;
  title: string;
  steps: Step[];
  clipTerminal: ClipTerminal;
};

export async function HomepageHowItWorks({ eyebrow, title, steps, clipTerminal }: Props) {
  const t = await getTranslations("HomepageHowItWorks");
  return (
    <section className="w-full px-4 py-14 md:py-20">
      <Card className="relative mx-auto w-full max-w-[1100px] overflow-hidden py-10 md:py-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-16 top-0 size-[360px] rounded-full bg-[rgba(94,74,227,0.12)] blur-[90px]" />

          <div className="absolute -right-16 bottom-0 size-[340px] rounded-full bg-[rgba(18,148,144,0.10)] blur-[80px]" />
        </div>

        <CardContent>
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block rounded-md bg-primary/15 px-3 py-1 text-[13px] font-medium text-primary">
              {eyebrow}
            </span>

            <h2 className="m-0 text-[28px] font-bold leading-tight tracking-tight md:text-[32px]">{title}</h2>
          </div>

          <div className="grid grid-cols-1 items-center gap-14 md:grid-cols-2">
            <ol className="flex flex-col gap-[18px]">
              {steps.map((step) => (
                <li key={step.n} className="flex gap-3.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-bold text-primary">
                    {step.n}
                  </div>

                  <div>
                    <div className="mb-0.5 text-[15px] font-semibold">{step.title}</div>

                    <div className="text-[13px] leading-[1.55] text-muted-foreground">{step.description}</div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="relative">
              <HomepageClipTerminal strings={clipTerminal} />

              <div className="mt-2.5 flex items-center justify-between px-1 font-mono text-[11px] text-muted-foreground">
                <span>{t("loopCaption")}</span>

                <span>{t("tailCaption")}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
