import type { HomepageFollowUp as HomepageFollowUpContent } from "@/core/fumadocs/schemas/homepage";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HomepageFollowUpDesk } from "./homepage-follow-up-desk";
import { SectionHeader } from "@/components/marketing/section-header";

export function HomepageFollowUp({ followUp }: { followUp: HomepageFollowUpContent }) {
  return (
    <MarketingSection className="mk-section" id="follow-up">
      <SectionHeader description={followUp.description} eyebrow={followUp.eyebrow} title={followUp.title} />

      <div className="mx-auto mt-12 max-w-[68rem]">
        <HomepageFollowUpDesk desk={followUp.desk} />
      </div>
    </MarketingSection>
  );
}
