import { MarketingContainer } from "@/components/marketing/marketing-container";
import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";

import { AgplGithubBadge } from "./agpl-github-badge";

type Props = {
  badge?: string;
  buttonLeftHref: string;
  buttonLeftText: string;
  buttonRightHref: string;
  buttonRightText: string;
  description: string;
  hint: string;
  title: string;
  titleAccent?: string;
};

export function PageHero({
  badge,
  title,
  titleAccent,
  description,
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  hint,
}: Props) {
  return (
    <div className="w-full pb-12 sm:pb-16">
      <MarketingContainer>
        <div className="flex flex-col items-center text-center">
          <AgplGithubBadge />

          {badge ? (
            <div className="mb-4 flex justify-center">
              <AppChip variant="secondary">{badge}</AppChip>
            </div>
          ) : null}

          <h1 className="text-display m-0 max-w-5xl">{title}</h1>

          {titleAccent ? (
            <p
              className="mt-2 text-2xl italic tracking-tight text-primary sm:text-3xl md:text-4xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {titleAccent}
            </p>
          ) : null}

          <p className="text-lede mt-6">{description}</p>

          <div className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild size="lg" variant="default">
              <IntlLink href={buttonLeftHref}>{buttonLeftText}</IntlLink>
            </Button>

            <Button asChild size="lg" variant="secondary">
              <IntlLink href={buttonRightHref} target="_blank">
                {buttonRightText}
              </IntlLink>
            </Button>
          </div>

          <p className="text-meta mt-6">{hint}</p>
        </div>
      </MarketingContainer>
    </div>
  );
}
