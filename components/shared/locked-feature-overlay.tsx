import type { ReactNode } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { UpsellCardBody, UpsellCardHeader } from "@/components/shared/upsell-card";

type Props = {
  title: string;
  description: ReactNode;
  action: ReactNode;
  children: ReactNode;
  eyebrow?: ReactNode;
  preview?: ReactNode;
  highlights?: ReactNode;
};

export function LockedFeatureOverlay({ title, description, action, children, eyebrow, preview, highlights }: Props) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none flex min-h-0 flex-1 flex-col select-none">
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-background/40 p-4 backdrop-blur-[1.5px]">
        <AppCard className="my-auto max-w-[26rem] shadow-xl" data-locked-feature="">
          <UpsellCardHeader eyebrow={eyebrow} headingLevel="h1" preview={preview} title={title} />

          <UpsellCardBody description={description} highlights={highlights} />

          <AppCardFooter>{action}</AppCardFooter>
        </AppCard>
      </div>
    </div>
  );
}
