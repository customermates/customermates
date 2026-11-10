import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

import { AgplGithubBadge } from "./agpl-github-badge";
import { HeadingText } from "./heading-text";
import { MarketingButton } from "./marketing-button";
import { MarketingContainer } from "./marketing-container";

type HeroBaseProps = {
  description: string;
  showOpenSourceBadge?: boolean;
  title: string;
  titleAccent?: string;
  visual?: ReactNode;
};

type HeroActions = {
  buttonLeftHref: string;
  buttonLeftText: string;
  buttonRightHref: string;
  buttonRightText: string;
  hint: string;
};

type HeroWithoutActions = {
  buttonLeftHref?: never;
  buttonLeftText?: never;
  buttonRightHref?: never;
  buttonRightText?: never;
  hint?: never;
};

type Props = HeroBaseProps & (HeroActions | HeroWithoutActions);

function hasHeroActions(props: Props): props is HeroBaseProps & HeroActions {
  return typeof props.buttonLeftHref === "string";
}

export function PageHero(props: Props) {
  const { title, titleAccent, description, showOpenSourceBadge = true, visual } = props;
  const actions = hasHeroActions(props) ? props : null;

  return (
    <section className="relative isolate w-full overflow-hidden bg-background" data-page-hero="">
      <div aria-hidden className="mk-hero-light" />

      <MarketingContainer className="relative z-10">
        <div
          className={cn(
            "pt-16 pb-10 sm:pt-20 sm:pb-12 lg:pt-24 lg:pb-14",
            visual ? "marketing-grid items-center gap-y-12" : "flex flex-col items-center text-center",
          )}
        >
          <div
            className={cn(
              "min-w-0",
              "mk-enter",
              visual ? "col-span-12 lg:col-span-6 lg:pr-8" : "flex max-w-[60rem] flex-col items-center",
            )}
          >
            {showOpenSourceBadge ? <AgplGithubBadge className="mk-hero-chip" /> : null}

            <div className={cn("m-0", visual ? "mk-display" : "mk-hero max-w-[60rem]")}>
              <h1 className="inline">
                <HeadingText text={title} />
              </h1>

              {titleAccent ? <span className="mk-quiet"> {titleAccent}</span> : null}
            </div>

            <p className={cn("mk-lede mt-6", !visual && "mx-auto")}>{description}</p>

            {actions ? (
              <>
                <div
                  className={cn(
                    "mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row",
                    visual ? "items-stretch sm:items-center" : "items-stretch justify-center sm:items-center",
                  )}
                >
                  <MarketingButton arrow href={actions.buttonLeftHref} size="lg">
                    {actions.buttonLeftText}
                  </MarketingButton>

                  <MarketingButton href={actions.buttonRightHref} size="lg" variant="secondary">
                    {actions.buttonRightText}
                  </MarketingButton>
                </div>

                <p className={cn("mk-caption mt-5", !visual && "text-center")}>{actions.hint}</p>
              </>
            ) : null}
          </div>

          {visual ? <div className="col-span-12 min-w-0 lg:col-span-6">{visual}</div> : null}
        </div>
      </MarketingContainer>
    </section>
  );
}
