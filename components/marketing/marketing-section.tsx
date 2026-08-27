import type { ElementType, ReactNode } from "react";

import { cn } from "@/core/utils/cn";

import { MarketingContainer } from "./marketing-container";

type MarketingSectionTone = "page" | "canvas" | "inverse";

type Props = {
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  description?: string;
  flush?: boolean;
  headingAs?: ElementType;
  headingClassName?: string;
  id?: string;
  title?: string;
  tone?: MarketingSectionTone;
};

export function MarketingSection({
  children,
  className,
  containerClassName,
  description,
  flush = false,
  headingAs,
  headingClassName,
  id,
  title,
  tone = "page",
}: Props) {
  const Heading = headingAs ?? "h2";
  const hasHeader = Boolean(title || description);
  const content = (
    <MarketingContainer className={containerClassName}>
      {hasHeader ? (
        <div className="mx-auto max-w-3xl text-center">
          {title ? <Heading className={cn("text-display-sm m-0", headingClassName)}>{title}</Heading> : null}

          {description ? <p className="text-lede mx-auto mt-5">{description}</p> : null}
        </div>
      ) : null}

      {children}
    </MarketingContainer>
  );

  return (
    <section
      className={cn(
        flush ? "marketing-section-flush" : "marketing-section",
        tone === "canvas" ? "bg-sidebar" : "bg-background",
        "text-foreground",
        className,
      )}
      data-marketing-tone={tone}
      id={id}
    >
      {content}
    </section>
  );
}
