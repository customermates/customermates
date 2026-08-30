import type { ReactNode } from "react";

import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ORGANIZATION_NAME } from "@/core/seo/schemas";
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
    <MarketingSection className="border-b-0 py-16 sm:py-20 lg:py-24" tone="canvas">
      <div className="marketing-grid items-end gap-y-10">
        <div className="col-span-12 lg:col-span-5">
          {image ? <div className="mb-6 max-w-32">{image}</div> : <p className="text-eyebrow">{ORGANIZATION_NAME}</p>}

          <h2 className="text-display-sm mt-5">{action}</h2>
        </div>

        <div className="col-span-12 lg:col-start-7 lg:col-end-13">
          <p className="text-lede">{description}</p>

          <div className="mt-7 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild className="w-full sm:w-auto" size="lg" variant="default">
              <IntlLink href={buttonLeftHref}>
                {buttonLeftText}

                <ArrowUpRight aria-hidden className="size-4" />
              </IntlLink>
            </Button>

            <Button asChild className="w-full sm:w-auto" size="lg" variant="secondary">
              <IntlLink
                href={buttonRightHref}
                rel={buttonRightIsExternal ? "noopener noreferrer" : undefined}
                target={buttonRightIsExternal ? "_blank" : undefined}
              >
                {buttonRightText}

                <ArrowUpRight aria-hidden className="size-4" />
              </IntlLink>
            </Button>
          </div>

          <p className="text-meta mt-4">{hint}</p>
        </div>
      </div>
    </MarketingSection>
  );
}
