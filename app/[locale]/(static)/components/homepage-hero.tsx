"use client";

import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { Button } from "@heroui/button";

import { EuropeanFlagIcon } from "./european-flag-icon";
import { GitHubStarButton } from "./github-star-button";

import { XLink } from "@/components/x-link";

type Props = {
  heroSection: Hero;
};

export function HomepageHero({ heroSection }: Props) {
  return (
    <>
      <GitHubStarButton />

      <h1 className="text-x-4xl px-4 max-w-4xl text-center">{heroSection.title}</h1>

      <h2 className="text-x-lg pt-4 md:pt-6 px-4 max-w-4xl text-center text-subdued">
        {heroSection.subtitle}

        <EuropeanFlagIcon />
      </h2>

      <div className="flex flex-col items-center my-8 md:my-10 px-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 w-full sm:w-auto">
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
          {heroSection.startFree}
        </p>
      </div>
    </>
  );
}
