import { MarketingSection } from "./marketing-section";
import type { FeatureVisualPilot as FeatureVisualPilotDefinition } from "./feature-visual-pilots";
import { FeaturePagePilotVisual } from "./feature-page-pilot-visual";

export function FeatureVisualPilot({ pilot }: { pilot: FeatureVisualPilotDefinition }) {
  const mediaLeading = pilot.patternId === "S-04";
  const copy = (
    <div
      className={mediaLeading ? "col-span-12 lg:col-start-8 lg:col-end-13 lg:row-start-1" : "col-span-12 lg:col-span-5"}
    >
      <p className="text-meta mb-4">{pilot.copy.eyebrow}</p>

      <h2 className="text-display-sm m-0">{pilot.copy.title}</h2>

      <p className="text-lede mt-5">{pilot.copy.description}</p>
    </div>
  );
  const visual = (
    <div
      className={
        mediaLeading
          ? "col-span-12 w-full lg:col-span-5 lg:row-start-1 lg:max-w-[28rem]"
          : "col-span-12 w-full lg:col-start-8 lg:col-end-13 lg:ml-auto lg:max-w-[28rem]"
      }
    >
      <FeaturePagePilotVisual brief={pilot.brief} description={pilot.copy.description} />
    </div>
  );

  return (
    <MarketingSection id={pilot.sectionId} tone={pilot.tone}>
      <div
        className="marketing-grid items-center gap-y-10"
        data-feature-visual-pilot={pilot.slug}
        data-pattern-id={pilot.patternId}
      >
        {mediaLeading ? visual : copy}

        {mediaLeading ? copy : visual}
      </div>
    </MarketingSection>
  );
}
