import type { Hero } from "@/core/fumadocs/schemas/automation";

import { Button } from "@/components/ui/button";
import { AgplGithubBadge } from "@/components/marketing/agpl-github-badge";
import { WaveDecoration } from "@/components/marketing/wave-decoration";

import { AppLink } from "@/components/shared/app-link";

type Props = Hero;

export function AutomationHero({
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  startFree,
  subtitle,
  title,
  titleAccent,
}: Props) {
  return (
    <section className="relative isolate py-16 md:py-24 w-full">
      <WaveDecoration
        className="-top-10 -left-40 w-[min(1000px,90vw)] md:-top-20 md:-left-56"
        opacity={0.45}
        variant="wave-1"
      />

      <WaveDecoration
        className="-top-4 right-0 hidden w-[min(700px,55vw)] md:block md:-top-8 md:-right-20"
        opacity={0.3}
        variant="wave-2"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-5 h-[620px] bg-[radial-gradient(ellipse_50%_55%_at_50%_45%,var(--background)_0%,color-mix(in_oklab,var(--background)_80%,transparent)_30%,transparent_85%)]"
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        <div className="text-center max-w-4xl mx-auto flex flex-col items-center">
          <AgplGithubBadge />

          <h1 className="text-x-4xl mb-3">{title}</h1>

          {titleAccent ? (
            <div
              className="mb-6 text-[26px] italic text-primary sm:text-[32px] md:text-[36px] tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {titleAccent}
            </div>
          ) : null}

          <p className="text-x-lg text-subdued mb-8">{subtitle}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-x-lg">
            <Button asChild className="w-full sm:w-auto shadow-lg" size="lg">
              <AppLink href={buttonLeftHref}>{buttonLeftText}</AppLink>
            </Button>

            <Button asChild className="w-full sm:w-auto" size="lg" variant="secondary">
              <AppLink external href={buttonRightHref}>
                {buttonRightText}
              </AppLink>
            </Button>
          </div>

          <p className="text-subdued text-x-sm flex items-center justify-center gap-2 mt-6 text-center">{startFree}</p>
        </div>
      </div>
    </section>
  );
}
