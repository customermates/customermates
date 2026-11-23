import type { HomepageProof } from "@/core/fumadocs/schemas/homepage";

import { ArrowRight, Check } from "lucide-react";

import { MarketingButton } from "@/components/marketing/marketing-button";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { AppImage } from "@/components/shared/app-image";
import { AppLink } from "@/components/shared/app-link";

/** A short personal note from the founder with a direct line to him. */
function FounderNote({ proof }: { proof: HomepageProof["proof"] }) {
  return (
    <div className="homepage-proof-card" data-homepage-proof="founder">
      <div className="grid gap-6 sm:grid-cols-[6rem_1fr] sm:gap-8">
        <AppImage
          alt={proof.name}
          className="size-20 shrink-0 rounded-full object-cover ring-4 ring-white/5 sm:size-24"
          height={192}
          src="benjamin-wagner.png"
          width={192}
        />

        <div className="min-w-0">
          <p className="mk-eyebrow !text-white/60">{proof.eyebrow}</p>

          <h2 className="mt-4 max-w-[32rem] text-[1.75rem] leading-[1.12] font-semibold tracking-[-0.03em] text-balance text-white sm:text-[2.125rem]">
            {proof.title}
          </h2>

          <div className="mt-5 space-y-4 text-[0.9375rem] leading-7 text-white/70">
            {proof.paragraphs.map((paragraph) => (
              <p key={paragraph} className="max-w-[36rem]">
                {paragraph}
              </p>
            ))}
          </div>

          <p aria-hidden className="mt-7 font-[cursive] text-2xl text-white/90">
            {proof.signature}
          </p>

          <p className="mt-1 text-xs text-white/50">{`${proof.name}, ${proof.role}`}</p>

          <div className="mt-7 flex flex-wrap gap-3">
            <MarketingButton arrow href={proof.contact.href}>
              {proof.contact.label}
            </MarketingButton>

            <MarketingButton href={proof.linkedin.href} variant="secondary">
              {proof.linkedin.label}
            </MarketingButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomepageProofPartners({ content }: { content: HomepageProof }) {
  const { partners, proof } = content;

  return (
    <MarketingSection className="mk-section" id="proof">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <FounderNote proof={proof} />

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
