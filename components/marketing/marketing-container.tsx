import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  children: ReactNode;
  className?: string;
  size?: "default" | "wide";
};

export function MarketingContainer({ children, className, size = "default" }: Props) {
  return (
    <div className={cn("marketing-container", size === "wide" && "marketing-container-wide", className)}>
      {children}
    </div>
  );
}
