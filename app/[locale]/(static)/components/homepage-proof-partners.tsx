import type { HomepageProof } from "@/core/fumadocs/schemas/homepage";

import { ArrowRight, Check } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { AppLink } from "@/components/shared/app-link";

export function HomepageProofPartners({ content }: { content: HomepageProof }) {
  const { partners } = content;

  return (
    <MarketingSection className="mk-section" id="partners">
      <div className="mk-card grid gap-6 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-10 lg:p-10">
        <div className="min-w-0">
          <p className="mk-eyebrow">{partners.eyebrow}</p>

          <h2 className="mt-4 text-[1.5rem] leading-[1.15] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-[1.75rem]">
            {partners.title}
          </h2>

          <p className="mt-4 text-[0.9375rem] leading-7 text-muted-foreground">{partners.description}</p>
        </div>

        <div className="min-w-0">
          <ul className="space-y-3">
            {partners.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm leading-6 text-foreground">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-foreground" />

                {point}
              </li>
            ))}
          </ul>

          <AppLink
            className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
            href={partners.cta.href}
          >
            {partners.cta.label}

            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </AppLink>
        </div>
      </div>
    </MarketingSection>
  );
}
