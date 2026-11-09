import type { ReactNode } from "react";

import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";

type HeaderProps = {
  title: string;
  eyebrow?: ReactNode;
  preview?: ReactNode;
  headingLevel?: "h1" | "h2";
};

export function UpsellCardHeader({ title, eyebrow, preview, headingLevel = "h2" }: HeaderProps) {
  const Heading = headingLevel;

  return (
    <AppCardHeader className="flex-col items-stretch gap-5" data-upsell-card-header="">
      {preview}

      <span className="flex flex-col gap-1.5">
        {eyebrow ? <span className="text-xs font-medium text-muted-foreground">{eyebrow}</span> : null}

        <Heading className="text-x-xl text-balance">{title}</Heading>
      </span>
    </AppCardHeader>
  );
}

type BodyProps = {
  description?: ReactNode;
  highlights?: ReactNode;
};

export function UpsellCardBody({ description, highlights }: BodyProps) {
  return (
    <AppCardBody>
      {description ? <p className="text-x-sm text-subdued">{description}</p> : null}

      {highlights}
    </AppCardBody>
  );
}
