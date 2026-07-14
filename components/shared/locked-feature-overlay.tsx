import type { ReactNode } from "react";

import { IntlLink } from "@/i18n/navigation";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description: ReactNode;
  ctaHref: string;
  ctaLabel: string;
  children: ReactNode;
};

export function LockedFeatureOverlay({ title, description, ctaHref, ctaLabel, children }: Props) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none flex min-h-0 flex-1 flex-col select-none">
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-background/40 p-4 backdrop-blur-[1.5px]">
        <AppCard className="max-w-md shadow-xl">
          <CardHeroHeader title={title} />

          <AppCardBody>
            <p className="text-x-sm text-center text-subdued">{description}</p>
          </AppCardBody>

          <AppCardFooter>
            <Button asChild className="w-full">
              <IntlLink href={ctaHref}>{ctaLabel}</IntlLink>
            </Button>
          </AppCardFooter>
        </AppCard>
      </div>
    </div>
  );
}
