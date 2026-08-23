import type { ElementType, ReactNode } from "react";

import { cn } from "@/core/utils/cn";

import { MarketingContainer } from "./marketing-container";

const HEADER_GRID = "grid gap-6 lg:grid-cols-[minmax(11rem,0.45fr)_minmax(0,1.55fr)] lg:gap-12";

type Props = {
  alignBody?: boolean;
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  description?: string;
  eyebrow?: string;
  flush?: boolean;
  headingAs?: ElementType;
  headingClassName?: string;
  id?: string;
  title?: string;
};

export function MarketingSection({
  alignBody = false,
  children,
  className,
  containerClassName,
  description,
  eyebrow,
  flush = false,
  headingAs,
  headingClassName,
  id,
  title,
}: Props) {
  const Heading = headingAs ?? "h2";
  const hasHeader = Boolean(eyebrow || title || description);

  return (
    <section className={cn(flush ? "marketing-section-flush" : "marketing-section", className)} id={id}>
      <MarketingContainer className={containerClassName}>
        {hasHeader ? (
          <div className={HEADER_GRID}>
            {eyebrow ? (
              <p className="text-eyebrow pt-1">{eyebrow}</p>
            ) : (
              <span aria-hidden className="hidden lg:block" />
            )}

            <div>
              {title ? <Heading className={cn("text-display m-0", headingClassName)}>{title}</Heading> : null}

              {description ? <p className="text-lede mt-5">{description}</p> : null}
            </div>
          </div>
        ) : null}

        {alignBody ? (
          <div className={HEADER_GRID}>
            <span aria-hidden className="hidden lg:block" />

            <div>{children}</div>
          </div>
        ) : (
          children
        )}
      </MarketingContainer>
    </section>
  );
}
