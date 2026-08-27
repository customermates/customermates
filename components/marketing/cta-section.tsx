import type { ReactNode } from "react";

import { MarketingSection } from "@/components/marketing/marketing-section";
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
    <MarketingSection flush>
      <div className="flex flex-col items-center rounded-panel border border-border bg-sidebar px-6 py-16 text-center sm:px-10 sm:py-20">
        <div className="mb-8">
          {image ?? (
            <AppImage
              alt="Customermates"
              className="h-auto w-[240px]"
              height={23}
              src="customermates.svg"
              width={229}
            />
          )}
        </div>

        <h2 className="text-display m-0">{action}</h2>

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
    </MarketingSection>
  );
}
