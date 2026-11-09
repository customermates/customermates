import type { ReactNode } from "react";

import { ORGANIZATION_NAME } from "@/core/seo/schemas";

import { MarketingButton } from "./marketing-button";
import { MarketingSection } from "./marketing-section";

type Props = {
  action: string;
  buttonLeftHref: string;
  buttonLeftText: string;
  buttonRightHref: string;
  buttonRightText: string;
  description: string;
  eyebrow?: string;
  hint: string;
  id?: string;
  image?: ReactNode;
};

export function CTASection({
  action,
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  description,
  eyebrow,
  hint,
  id,
  image,
}: Props) {
  return (
    <MarketingSection className="relative isolate overflow-hidden border-b-0" id={id}>
      <div
        data-reveal
        className="mk-card-raised relative mx-auto max-w-[60rem] overflow-hidden px-6 py-14 text-center sm:px-12 sm:py-20"
        data-cta-section=""
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-foreground/20 to-transparent"
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--foreground)_5%,transparent),transparent)]"
        />

        <div className="relative">
          {image ? <div className="mx-auto mb-6 max-w-32">{image}</div> : null}

          <p className="mk-eyebrow">{eyebrow ?? ORGANIZATION_NAME}</p>

          <h2 className="mk-display mx-auto mt-3 max-w-[40rem]">{action}</h2>

          <p className="mk-lede mx-auto mt-5">{description}</p>

          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <MarketingButton arrow href={buttonLeftHref} size="lg">
              {buttonLeftText}
            </MarketingButton>

            <MarketingButton href={buttonRightHref} size="lg" variant="secondary">
              {buttonRightText}
            </MarketingButton>
          </div>

          <p className="mk-caption mt-5">{hint}</p>
        </div>
      </div>
    </MarketingSection>
  );
}
