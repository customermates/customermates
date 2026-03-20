import type { Hero } from "@/core/fumadocs/schemas/affiliate";

import { Button } from "@heroui/button";

import { XLink } from "@/components/x-link";

type Props = {
  heroSection: Hero;
};

export function AffiliateHero({ heroSection }: Props) {
  return (
    <section className="py-16 md:py-24 w-full">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-12 text-center max-w-3xl mx-auto">
          <h1 className="text-x-4xl tracking-tight pb-4 text-transparent bg-clip-text bg-linear-to-b from-neutral-900 via-neutral-700 to-neutral-500 dark:from-white dark:via-gray-200 dark:to-gray-400">
            {heroSection.title}
          </h1>

          <h2 className="text-x-lg text-subdued pb-8">{heroSection.description}</h2>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6">
            <Button
              as={XLink}
              className="w-full sm:w-auto"
              color="primary"
              href={heroSection.buttonLeftHref}
              size="lg"
              variant="shadow"
            >
              {heroSection.buttonLeftText}
            </Button>

            <Button
              as={XLink}
              className="w-full sm:w-auto"
              href={heroSection.buttonRightHref}
              size="lg"
              target="_blank"
              variant="bordered"
            >
              {heroSection.buttonRightText}
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
