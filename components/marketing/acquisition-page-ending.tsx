import type { AcquisitionPage } from "@/core/fumadocs/schemas/common";

import { CTASection } from "./cta-section";
import { MarketingSection } from "./marketing-section";
import { RelatedPage, RelatedPages } from "./related-pages";

export function AcquisitionPageEnding({ acquisition }: { acquisition: AcquisitionPage }) {
  return (
    <>
      <MarketingSection className="py-14 sm:py-18 lg:py-20" tone="page">
        <RelatedPages>
          {acquisition.relatedHrefs.map((href) => (
            <RelatedPage key={href} href={href} presentation="text" />
          ))}
        </RelatedPages>
      </MarketingSection>

      <CTASection {...acquisition.cta} />
    </>
  );
}
