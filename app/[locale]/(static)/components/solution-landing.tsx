import type { SolutionLanding as SolutionLandingContent } from "@/core/fumadocs/schemas/solution-landing";
import type { SolutionId } from "@/core/solutions/solution-catalog";
import type { UseCases } from "@/core/fumadocs/schemas/use-cases";

import { Check, Minus } from "lucide-react";

import { MarketingButton } from "@/components/marketing/marketing-button";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { ProductFilm } from "@/components/marketing/product-film";
import { UseCasesSection } from "@/components/marketing/use-cases-section";

import { HomepageFollowUpDesk } from "./homepage-follow-up-desk";
import { homepageContent, LandingSteps } from "./landing-sections";
import { SectionHeader } from "@/components/marketing/section-header";
import { HomepageWorkspacePrompt, WorkspaceBuildSteps } from "./homepage-workspace-generator";
import { SolutionProductStage } from "./solution-product-stage";

type Props = {
  landing: SolutionLandingContent;
  locale: string;
  solutionId: SolutionId;
  useCases?: UseCases;
};

export function SolutionLanding({ landing, locale, solutionId, useCases }: Props) {
  const { beforeAfter, followUp, generator, hero, plan, steps } = landing;

  return (
    <>
      <div className="contents" data-solution-landing="hero">
        <MarketingHero
          description={hero.description}
          eyebrow={hero.eyebrow}
          footnotes={<p className="text-muted-foreground">{landing.facts}</p>}
          primary={hero.primaryCta}
          secondary={hero.secondaryCta}
          title={hero.title}
        />
      </div>

      <ProductFilm />

      {useCases ? <UseCasesSection useCases={useCases} /> : null}

      <MarketingSection className="mk-section w-full" id="workspace">
        <SectionHeader description={generator.description} eyebrow={generator.eyebrow} title={generator.title} />

        <WorkspaceBuildSteps steps={homepageContent(locale).generator.steps} />

        <HomepageWorkspacePrompt
          arrowLabel={generator.arrowLabel}
          prompt={generator.prompt}
          promptLabel={generator.promptLabel}
        />

        <SolutionProductStage className="mt-0" locale={locale} solutionId={solutionId} />
      </MarketingSection>

      <MarketingSection className="mk-section w-full" id="follow-up">
        <SectionHeader description={followUp.description} eyebrow={followUp.eyebrow} title={followUp.title} />

        <div className="mx-auto mt-12 max-w-[68rem]">
          <HomepageFollowUpDesk desk={followUp.desk} />
        </div>
      </MarketingSection>

      <MarketingSection className="mk-section w-full" id="before-after">
        <SectionHeader description={beforeAfter.description} eyebrow={beforeAfter.eyebrow} title={beforeAfter.title} />

        <div className="mx-auto mt-12 grid max-w-[60rem] gap-4 md:grid-cols-2">
          <div className="mk-card p-6 sm:p-7">
            <p className="text-sm font-semibold text-muted-foreground">{beforeAfter.before.label}</p>

            <ul className="mt-5 space-y-3.5">
              {beforeAfter.before.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[0.9375rem] leading-6 text-muted-foreground">
                  <Minus aria-hidden className="mt-1 size-4 shrink-0" />

                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="mk-card mk-card-featured p-6 sm:p-7">
            <p className="text-sm font-semibold text-foreground">{beforeAfter.after.label}</p>

            <ul className="mt-5 space-y-3.5">
              {beforeAfter.after.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[0.9375rem] leading-6 text-foreground">
                  <Check aria-hidden className="mt-1 size-4 shrink-0 text-foreground" />

                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MarketingSection>

      <LandingSteps eyebrow={steps.eyebrow} id="steps" steps={steps} title={steps.title} />

      <MarketingSection className="mk-section w-full" id="plan">
        <SectionHeader description={plan.description} eyebrow={plan.eyebrow} title={plan.title} />

        <div className="mt-9 flex justify-center">
          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <MarketingButton arrow href={plan.primaryCta.href} size="lg">
              {plan.primaryCta.label}
            </MarketingButton>

            <MarketingButton href={plan.secondaryCta.href} size="lg" variant="secondary">
              {plan.secondaryCta.label}
            </MarketingButton>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-[40rem] text-center text-sm text-muted-foreground">{plan.limits}</p>
      </MarketingSection>
    </>
  );
}
