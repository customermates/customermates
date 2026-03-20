"use client";

import type { Hero } from "@/core/fumadocs/schemas/features";

import { Button } from "@heroui/button";

import { XLink } from "@/components/x-link";

type Props = Hero;

export function FeaturesHero({
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  description,
  title,
}: Props) {
  return (
    <section className="py-16 md:py-24 w-full">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-x-4xl mb-6">{title}</h1>

          <p className="text-x-lg text-subdued mb-8">{description}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-x-lg">
            <Button
              as={XLink}
              className="w-full sm:w-auto"
              color="primary"
              href={buttonLeftHref}
              size="lg"
              variant="shadow"
            >
              {buttonLeftText}
            </Button>

            <Button
              as={XLink}
              className="w-full sm:w-auto"
              href={buttonRightHref}
              size="lg"
              target="_blank"
              variant="bordered"
            >
              {buttonRightText}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
