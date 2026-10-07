import type { ContentLocale } from "@/i18n/locale-registry";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Step, Steps } from "@/components/marketing/process-steps";

import { HomepageCaptureImage } from "./homepage-capture-image";

type StepItem = { description: string; n: string; title: string };

type Props = {
  eyebrow: string;
  handoff: {
    alt: string;
    description: string;
    eyebrow: string;
    title: string;
  };
  locale: ContentLocale;
  steps: StepItem[];
  title: string;
};

export function HomepageHowItWorks({ eyebrow, handoff, locale, steps, title }: Props) {
  return (
    <>
      <MarketingSection id="human-handoff">
        <div className="marketing-grid items-center gap-y-10">
          <div className="col-span-12 lg:col-span-7 lg:row-start-1">
            <div className="overflow-hidden rounded-card border border-border bg-card shadow-xl shadow-black/5">
              <HomepageCaptureImage
                alt={handoff.alt}
                locale={locale}
                name="homepage-draft"
                sizes="(min-width: 1024px) 50vw, 92vw"
              />
            </div>
          </div>

          <div className="col-span-12 lg:col-start-9 lg:col-end-13 lg:row-start-1">
            <p className="text-eyebrow">{handoff.eyebrow}</p>

            <h2 className="text-display-sm mt-5">{handoff.title}</h2>

            <p className="text-lede mt-5">{handoff.description}</p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection id="connect-ai" tone="canvas">
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
