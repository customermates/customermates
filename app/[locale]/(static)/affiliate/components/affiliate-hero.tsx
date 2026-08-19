import type { Hero } from "@/core/fumadocs/schemas/affiliate";

import { Button } from "@/components/ui/button";
import { WaveDecoration } from "@/components/marketing/wave-decoration";

import { AppLink } from "@/components/shared/app-link";

type Props = {
  heroSection: Hero;
};

export function AffiliateHero({ heroSection }: Props) {
  return (
    <section className="relative isolate py-16 md:py-24 w-full">
      <WaveDecoration
        className="-top-10 -left-40 w-[min(1000px,90vw)] md:-top-24 md:-left-56"
        opacity={0.45}
        variant="wave-2"
      />

      <WaveDecoration
        className="-top-4 right-0 hidden w-[min(700px,55vw)] md:block md:-top-8 md:-right-20"
        opacity={0.3}
        variant="wave-1"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[520px] bg-[radial-gradient(ellipse_50%_55%_at_50%_45%,var(--background)_0%,color-mix(in_oklab,var(--background)_80%,transparent)_30%,transparent_85%)]"
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4">
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <h1 className="text-x-4xl tracking-tight pb-4 text-transparent bg-clip-text bg-linear-to-b from-neutral-900 via-neutral-700 to-neutral-500 dark:from-white dark:via-gray-200 dark:to-gray-400">
            {heroSection.title}
          </h1>

          <h2 className="text-x-lg text-subdued pb-8">{heroSection.description}</h2>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6">
            <Button asChild className="w-full sm:w-auto shadow-lg" size="lg">
              <AppLink href={heroSection.buttonLeftHref}>{heroSection.buttonLeftText}</AppLink>
            </Button>

            <Button asChild className="w-full sm:w-auto" size="lg" variant="secondary">
              <AppLink external href={heroSection.buttonRightHref}>
                {heroSection.buttonRightText}
              </AppLink>
            </Button>
          </div>

          <p className="text-subdued text-x-sm flex items-center justify-center gap-2 mt-6 text-center">
            {heroSection.hint}
          </p>
        </div>
      </div>
    </section>
  );
}
