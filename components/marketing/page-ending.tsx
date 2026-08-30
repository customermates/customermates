import type { ComponentProps } from "react";

import { CTASection } from "./cta-section";
import { MarketingSection } from "./marketing-section";
import { RelatedPage, RelatedPages } from "./related-pages";

type Props = {
  cta: ComponentProps<typeof CTASection>;
  relatedHrefs: readonly string[];
};

export function PageEnding({ cta, relatedHrefs }: Props) {
  return (
    <>
      <MarketingSection className="py-14 sm:py-18 lg:py-20" tone="page">
        <RelatedPages>
          {relatedHrefs.map((href) => (
            <RelatedPage key={href} href={href} />
          ))}
        </RelatedPages>
      </MarketingSection>

      <CTASection {...cta} />
    </>
  );
}
