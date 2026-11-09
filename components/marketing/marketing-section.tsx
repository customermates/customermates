import type { ElementType, ReactNode } from "react";

import { cn } from "@/core/utils/cn";

import { MarketingContainer } from "./marketing-container";
import { SectionHeader } from "./section-header";

type MarketingSectionTone = "page" | "canvas";

type Props = {
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  description?: string;
  divider?: boolean;
  eyebrow?: string;
  headerAlign?: "center" | "start";
  flush?: boolean;
  headingAs?: ElementType;
  headingClassName?: string;
  id?: string;
  title?: string;
  tone?: MarketingSectionTone;
  containerSize?: "default" | "wide";
};

export function MarketingSection({
  children,
  className,
  containerClassName,
  description,
  divider = false,
  eyebrow,
  headerAlign = "center",
  flush = false,
  headingAs,
  headingClassName,
  id,
  title,
  tone = "page",
  containerSize = "default",
}: Props) {
  const Heading = headingAs ?? "h2";
  const hasHeader = Boolean(title || description);
  const content = (
    <MarketingContainer className={containerClassName} size={containerSize}>
      {hasHeader && title ? (
        <SectionHeader
          align={headerAlign}
          as={Heading}
          className={headingClassName}
          description={description}
          eyebrow={eyebrow}
          title={title}
        />
      ) : null}

      {hasHeader && !title ? (
        <div className="mk-header">
          <p className="mk-lede">{description}</p>
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
      data-marketing-divider={divider ? "explicit" : undefined}
      data-marketing-tone={tone}
      id={id}
    >
      {content}
    </section>
  );
}
