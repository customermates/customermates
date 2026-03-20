"use client";

import type { Hero } from "@/core/fumadocs/schemas/homepage";

import { Button } from "@heroui/button";

import { XLink } from "@/components/x-link";

type Props = {
  heroSection: Hero;
};

function EuropeanFlagIcon() {
  return (
    <svg
      aria-label="European flag"
      className="inline ml-2 w-8 rounded align-sub"
      fill="none"
      role="img"
      viewBox="0 0 767 512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>European flag</title>

      <path className="fill-[#233E90]/80" d="M766 1H1v510h765V1Z" />

      <path
        className="fill-yellow-400"
        d="m387 117-35 25 13-41-35-26h43l14-41 14 41h43l-35 26 13 41-35-25Zm114 43-35 25 13-41-35-26h43l14-41 14 41h43l-35 26 13 41-35-25Zm47 125-35 25 13-41-35-26h43l14-41 14 41h43l-35 26 13 41-35-25Zm-321 0-35 25 13-41-35-26h43l14-41 14 41h43l-35 26 13 41-35-25Zm283 125-35 25 13-41-35-26h43l14-41 14 41h43l-35 26 13 41-35-25Zm-123 35-35 25 13-41-35-26h43l14-41 14 41h43l-35 26 13 41-35-25Zm-123-35-35 25 13-41-35-26h43l14-41 14 41h43l-35 26 13 41-35-25Zm0-250-35 25 13-41-35-26h43l14-41 14 41h43l-35 26 13 41-35-25Z"
      />
    </svg>
  );
}

export function HomepageHero({ heroSection }: Props) {
  return (
    <>
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
