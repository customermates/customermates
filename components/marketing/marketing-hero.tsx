import type { ReactNode } from "react";

import { Play } from "lucide-react";

import { AgplGithubBadge } from "./agpl-github-badge";
import { MarketingButton } from "./marketing-button";
import { MarketingContainer } from "./marketing-container";
import { TwoToneTitle } from "./section-header";

type Action = {
  href: string;
  label: string;
};

type Props = {
  children?: ReactNode;
  description: string;
  eyebrow?: string;
  footnotes?: ReactNode;
  primary?: Action;
  secondary?: Action & { play?: boolean };
  showOpenSourceBadge?: boolean;
  title: string;
  titleAccent?: string;
};

export function MarketingHero({
  children,
  description,
  eyebrow,
  footnotes,
  primary,
  secondary,
  showOpenSourceBadge = true,
  title,
  titleAccent,
}: Props) {
  return (
    <section className="mk-hero-section relative isolate w-full" data-marketing-hero="">
      <div aria-hidden className="mk-hero-light" data-extend={children ? "" : undefined} />

      <MarketingContainer className="relative pt-14 pb-10 sm:pt-20 sm:pb-12 lg:pt-24">
        <div className="mk-enter mx-auto flex max-w-[60rem] flex-col items-center text-center">
          {eyebrow ? (
            <p className="mk-eyebrow">{eyebrow}</p>
          ) : showOpenSourceBadge ? (
            <AgplGithubBadge className="mk-hero-chip" />
          ) : null}

          <h1 className="mk-hero mt-4">
            {titleAccent ? (
              <>
                {`${title} `}

                <span className="mk-quiet">{titleAccent}</span>
              </>
            ) : (
              <TwoToneTitle title={title} />
            )}
          </h1>

          <p className="mk-lede mt-6">{description}</p>

          {primary || secondary ? (
            <div className="mt-9 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
              {primary ? (
                <MarketingButton arrow href={primary.href} size="lg">
                  {primary.label}
                </MarketingButton>
              ) : null}

              {secondary ? (
                secondary.play ? (
                  <a className="mk-button mk-button-lg mk-button-ghost" href={secondary.href}>
                    <span aria-hidden className="mk-play">
                      <Play className="!size-3 fill-current" />
                    </span>

                    {secondary.label}
                  </a>
                ) : (
                  <MarketingButton href={secondary.href} size="lg" variant="secondary">
                    {secondary.label}
                  </MarketingButton>
                )
              ) : null}
            </div>
          ) : null}

          {footnotes ? <div className="mt-7 grid gap-1 text-sm">{footnotes}</div> : null}
        </div>

        {children}
      </MarketingContainer>
    </section>
  );
}
