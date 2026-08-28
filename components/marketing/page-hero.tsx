import type { ReactNode } from "react";

import { ArrowUpRight } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { GridPattern } from "@/components/shared/grid-pattern";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

import { AgplGithubBadge } from "./agpl-github-badge";
import { MarketingContainer } from "./marketing-container";

type Props = {
  badge?: string;
  buttonLeftHref: string;
  buttonLeftText: string;
  buttonRightHref: string;
  buttonRightText: string;
  description: string;
  hint: string;
  showOpenSourceBadge?: boolean;
  title: string;
  titleAccent?: string;
  visual?: ReactNode;
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
  showOpenSourceBadge = true,
  visual,
}: Props) {
  return (
    <section className="relative isolate w-full overflow-hidden border-b border-border bg-background">
      <GridPattern className="z-0" fade="bottom" />

      <MarketingContainer className="relative z-10">
        <div
          className={cn(
            "py-16 sm:py-20 lg:py-28",
            visual ? "marketing-grid items-center gap-y-12" : "flex flex-col items-center text-center",
          )}
        >
          <div
            className={cn(
              "min-w-0",
              visual ? "col-span-12 lg:col-span-6 lg:pr-8" : "flex max-w-5xl flex-col items-center",
            )}
          >
            {showOpenSourceBadge ? <AgplGithubBadge /> : null}

            {badge ? (
              <div className={cn("mb-5 flex", visual ? "justify-start" : "justify-center")}>
                <AppChip variant="secondary">{badge}</AppChip>
              </div>
            ) : null}

            <h1 className={cn("text-display m-0", !visual && "max-w-5xl")}>
              {title}

              {titleAccent ? <span> {titleAccent}</span> : null}
            </h1>

            <p className={cn("text-lede mt-7", !visual && "mx-auto")}>{description}</p>

            <div
              className={cn(
                "mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row",
                visual ? "items-stretch sm:items-center" : "items-stretch justify-center sm:items-center",
              )}
            >
              <Button asChild className="w-full sm:w-auto" size="lg" variant="default">
                <IntlLink href={buttonLeftHref}>
                  {buttonLeftText}

                  <ArrowUpRight aria-hidden className="size-4" />
                </IntlLink>
              </Button>

              <Button asChild className="w-full sm:w-auto" size="lg" variant="secondary">
                <IntlLink href={buttonRightHref} target="_blank">
                  {buttonRightText}

                  <ArrowUpRight aria-hidden className="size-4" />
                </IntlLink>
              </Button>
            </div>

            <p className={cn("text-meta mt-5", !visual && "text-center")}>{hint}</p>
          </div>

          {visual ? <div className="col-span-12 min-w-0 lg:col-span-6">{visual}</div> : null}
        </div>
      </MarketingContainer>
    </section>
  );
}
