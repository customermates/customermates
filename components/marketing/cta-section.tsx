import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AppImage } from "@/components/shared/app-image";
import { IntlLink } from "@/i18n/navigation";

import { MarketingSection } from "./marketing-section";

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
  const buttonRightIsExternal = buttonRightHref.startsWith("https://") || buttonRightHref.startsWith("http://");

  return (
    <MarketingSection className="border-b-0" tone="page">
      <div className="rounded-card border border-border bg-sidebar px-6 py-14 text-center sm:px-10 sm:py-16 lg:px-16 lg:py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          <div className="mb-7 flex justify-center">
            {image ?? (
              <AppImage alt="Customermates" className="size-auto" height={27} src="customermates.svg" width={240} />
            )}
          </div>

          <h2 className="text-display-sm m-0">{action}</h2>

          <p className="text-lede mx-auto mt-5">{description}</p>

          <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild className="w-full sm:w-auto" size="lg" variant="default">
              <IntlLink href={buttonLeftHref}>{buttonLeftText}</IntlLink>
            </Button>

            <Button asChild className="w-full sm:w-auto" size="lg" variant="secondary">
              <IntlLink
                href={buttonRightHref}
                rel={buttonRightIsExternal ? "noopener noreferrer" : undefined}
                target={buttonRightIsExternal ? "_blank" : undefined}
              >
                {buttonRightText}
              </IntlLink>
            </Button>
          </div>

          <p className="text-meta mt-5">{hint}</p>
        </div>
      </div>
    </MarketingSection>
  );
}
