import type { HomepageProof } from "@/core/fumadocs/schemas/homepage";

import { ArrowRight, Check } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { AppLink } from "@/components/shared/app-link";

export function HomepageProofPartners({ content }: { content: HomepageProof }) {
  const { partners, proof } = content;

  return (
    <MarketingSection className="mk-section" id="proof">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="homepage-proof-card">
          <p className="mk-eyebrow !text-white/60">{proof.eyebrow}</p>

          <h2 className="mt-4 max-w-[28rem] text-[1.75rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance text-white sm:text-[2.125rem]">
            {proof.title}
          </h2>

          <p className="mt-4 max-w-[34rem] text-[0.9375rem] leading-7 text-white/70">{proof.description}</p>

          <ol className="mt-8 grid gap-2 sm:grid-cols-3">
            {proof.steps.map((step, index) => (
              <li key={step} className="homepage-proof-step">
                <span className="text-[0.6875rem] font-medium text-white/50 tabular-nums">{`0${index + 1}`}</span>

                <span className="mt-2 block text-[0.8125rem] leading-5 text-white/90">{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-xs text-white/50">{proof.note}</p>
        </div>

        <div className="homepage-pillar-tile">
          <p className="mk-eyebrow">{partners.eyebrow}</p>

          <h2 className="mt-4 text-[1.5rem] leading-[1.15] font-semibold tracking-[-0.03em] text-balance text-foreground sm:text-[1.75rem]">
            {partners.title}
          </h2>

          <p className="mt-4 text-[0.9375rem] leading-7 text-muted-foreground">{partners.description}</p>

          <ul className="mt-6 flex-1 space-y-3">
            {partners.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-foreground">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />

                {point}
              </li>
            ))}
          </ul>

          <AppLink
            className="group mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
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
