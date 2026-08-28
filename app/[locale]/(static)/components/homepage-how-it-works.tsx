import type { ContentLocale } from "@/i18n/locale-registry";
import type { HomepageVisualLabels } from "@/core/fumadocs/schemas/homepage";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Step, Steps } from "@/components/marketing/process-steps";

import { HomepageHandoffVisual } from "./homepage-story-visuals";

type StepItem = { description: string; n: string; title: string };

type Props = {
  eyebrow: string;
  handoff: {
    description: string;
    eyebrow: string;
    title: string;
  };
  locale: ContentLocale;
  steps: StepItem[];
  title: string;
  visualLabels: HomepageVisualLabels;
};

export function HomepageHowItWorks({ eyebrow, handoff, locale, steps, title, visualLabels }: Props) {
  return (
    <>
      <MarketingSection id="human-handoff">
        <div className="marketing-grid items-center gap-y-10">
          <div className="col-span-12 lg:col-span-7 lg:row-start-1">
            <HomepageHandoffVisual labels={visualLabels} locale={locale} />
          </div>

          <div className="col-span-12 lg:col-start-9 lg:col-end-13 lg:row-start-1">
            <p className="text-eyebrow">{handoff.eyebrow}</p>

            <h2 className="text-display-sm mt-5">{handoff.title}</h2>

            <p className="text-lede mt-5">{handoff.description}</p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection id="how-it-works" tone="canvas">
        <div className="marketing-grid gap-y-10">
          <div className="col-span-12 lg:col-span-4">
            <p className="text-eyebrow">{eyebrow}</p>

            <h2 className="text-display-sm mt-5">{title}</h2>
          </div>

          <div className="col-span-12 lg:col-start-7 lg:col-end-13">
            <Steps className="my-0">
              {steps.map((step) => (
                <Step key={step.n} title={step.title}>
                  <p>{step.description}</p>
                </Step>
              ))}
            </Steps>
          </div>
        </div>
      </MarketingSection>
    </>
  );
}
