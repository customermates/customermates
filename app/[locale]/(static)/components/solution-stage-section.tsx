import type { SolutionId } from "@/core/solutions/solution-catalog";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageWorkspacePrompt, WorkspaceBuildSteps } from "./homepage-workspace-generator";
import { homepageContent } from "./landing-sections";
import { SolutionProductStage } from "./solution-product-stage";

type Props = {
  locale: string;
  solutionId: SolutionId;
};

export function SolutionStageSection({ locale, solutionId }: Props) {
  const { generator } = homepageContent(locale);
  const prompt = generator.items.find((item) => item.solution === solutionId)?.prompt;

  return (
    <MarketingSection
      className="mk-section"
      description={generator.description}
      eyebrow={generator.eyebrow}
      id="workspace"
      title={generator.title}
    >
      <WorkspaceBuildSteps steps={generator.steps} />

      {prompt ? (
        <HomepageWorkspacePrompt
          arrowLabel={generator.arrowLabel}
          prompt={prompt}
          promptLabel={generator.promptLabel}
        />
      ) : null}

      <SolutionProductStage className="mt-0" locale={locale} solutionId={solutionId} />
    </MarketingSection>
  );
}
