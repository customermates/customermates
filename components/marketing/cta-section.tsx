import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AppImage } from "@/components/shared/app-image";
import { IntlLink } from "@/i18n/navigation";

type Props = {
  action: string;
  buttonLeftHref: string;
  buttonLeftText: string;
  buttonRightHref: string;
  buttonRightText: string;
  description: string;
  hint: string;
  image?: ReactNode;
};

export function CTASection({
  action,
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  description,
  hint,
  image,
}: Props) {
  return (
    <section className="relative w-full overflow-hidden py-14 md:py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[12%] top-0 size-[300px] rounded-full bg-[rgba(94,74,227,0.12)] blur-[80px]" />

        <div className="absolute right-[12%] bottom-0 size-[300px] rounded-full bg-[rgba(18,148,144,0.12)] blur-[80px]" />
      </div>

      <div className="relative mx-auto max-w-[1100px] px-4">
        <div
          className="relative rounded-[18px] p-[1.5px]"
          style={{
            background:
              "linear-gradient(135deg, rgba(94,74,227,0.55), rgba(18,148,144,0.35) 40%, transparent 70%, rgba(94,74,227,0.45))",
          }}
        >
          <div className="relative isolate overflow-hidden rounded-[16.5px] bg-background px-6 py-16 shadow-[0_30px_80px_-30px_rgba(94,74,227,0.35)] md:px-12 md:py-24">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_1px_1px,rgba(94,74,227,0.12)_1px,transparent_0)] [background-size:22px_22px]"
              style={{
                maskImage: "radial-gradient(ellipse 50% 80% at 50% 50%, #000 20%, transparent 75%)",
                WebkitMaskImage: "radial-gradient(ellipse 50% 80% at 50% 50%, #000 20%, transparent 75%)",
              }}
            />

            <svg
              aria-hidden
              className="absolute left-[18%] top-[34px] text-primary opacity-55"
              height="14"
              viewBox="0 0 14 14"
              width="14"
            >
              <path d="M7 0 L8.2 5.8 L14 7 L8.2 8.2 L7 14 L5.8 8.2 L0 7 L5.8 5.8 Z" fill="currentColor" />
            </svg>

            <svg
              aria-hidden
              className="absolute right-[14%] top-[90px] opacity-55"
              height="10"
              style={{ color: "#129490" }}
              viewBox="0 0 14 14"
              width="10"
            >
              <path d="M7 0 L8.2 5.8 L14 7 L8.2 8.2 L7 14 L5.8 8.2 L0 7 L5.8 5.8 Z" fill="currentColor" />
            </svg>

            <svg
              aria-hidden
              className="absolute right-[22%] bottom-[80px] text-primary opacity-60"
              height="8"
              viewBox="0 0 14 14"
              width="8"
            >
              <path d="M7 0 L8.2 5.8 L14 7 L8.2 8.2 L7 14 L5.8 8.2 L0 7 L5.8 5.8 Z" fill="currentColor" />
            </svg>

            <div className="relative z-10 flex flex-col items-center justify-center text-center">
              <div className="mx-auto px-4">
                <div className="mb-6 flex justify-center md:mb-8">
                  {image ?? <AppImage alt="Customermates" height={27} src="customermates.svg" width={240} />}
                </div>
              </div>

              <h2 className="text-x-3xl mb-4 md:mb-6">{action}</h2>

              <p className="text-x-lg mx-auto mb-6 max-w-3xl text-subdued md:mb-10">{description}</p>

              <div className="mb-6 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row md:mb-8 md:gap-6">
                <Button asChild className="w-full sm:w-auto" size="lg" variant="default">
                  <IntlLink href={buttonLeftHref}>{buttonLeftText}</IntlLink>
                </Button>

                <Button asChild className="w-full sm:w-auto" size="lg" variant="outline">
                  <IntlLink href={buttonRightHref} target="_blank">
                    {buttonRightText}
                  </IntlLink>
                </Button>
              </div>

              <p className="text-x-sm flex items-center justify-center gap-2 text-subdued">{hint}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
