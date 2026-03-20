"use client";

import type { CTA } from "@/core/fumadocs/schemas/common";

import { Button } from "@heroui/button";

import { XImage } from "./x-image";

import { XLink } from "@/components/x-link";

type Props = CTA;

export function XCTASection({
  action,
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  description,
  hint,
}: Props) {
  return (
    <section className="py-12 md:py-20 w-full">
      <div className="max-w-7xl mx-auto px-4">
        <div className="relative md:p-12 flex flex-col items-center justify-center text-center">
          <div className="mx-auto px-4">
            <div className="flex justify-center mb-6 md:mb-8">
              <XImage alt="Customermates" height={27} src="customermates.svg" width={240} />
            </div>
          </div>

          <h2 className="text-x-3xl mb-4 md:mb-6">{action}</h2>

          <p className="text-x-lg text-subdued mb-6 md:mb-10 max-w-3xl mx-auto">{description}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 mb-6 md:mb-8 w-full sm:w-auto">
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

          <p className="text-subdued text-x-sm flex items-center justify-center gap-2">{hint}</p>
        </div>
      </div>
    </section>
  );
}
