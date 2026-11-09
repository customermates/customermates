import type { ElementType, ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type TwoToneProps = {
  title: string;
};

export function TwoToneTitle({ title }: TwoToneProps) {
  const split = title.indexOf(". ");
  if (split < 0 || split === title.length - 2) return <>{title}</>;

  return (
    <>
      {`${title.slice(0, split + 1)} `}

      <span className="mk-quiet">{title.slice(split + 2)}</span>
    </>
  );
}

type Props = {
  align?: "center" | "start";
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  size?: "display" | "hero";
  title: string;
};

export function SectionHeader({
  align = "center",
  as: Heading = "h2",
  children,
  className,
  description,
  eyebrow,
  size = "display",
  title,
}: Props) {
  return (
    <div data-reveal className={cn("mk-header", className)} data-align={align} data-section-header="">
      {eyebrow ? <p className="mk-eyebrow">{eyebrow}</p> : null}

      <Heading className={cn(size === "hero" ? "mk-hero" : "mk-display", eyebrow && "mt-3")}>
        <TwoToneTitle title={title} />
      </Heading>

      {description ? <p className="mk-lede mt-5">{description}</p> : null}

      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}
