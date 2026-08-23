import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "flush" | "matted";
};

export function MediaPlate({ caption, children, className, variant = "flush" }: Props) {
  return (
    <figure className={cn("m-0", className)}>
      <div className={cn("overflow-hidden rounded-card border border-border bg-card", variant === "matted" && "p-2")}>
        <div className={cn(variant === "matted" && "overflow-hidden rounded-lg")}>{children}</div>
      </div>

      {caption ? <figcaption className="text-meta mt-3">{caption}</figcaption> : null}
    </figure>
  );
}
