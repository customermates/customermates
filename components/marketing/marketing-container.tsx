import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  children: ReactNode;
  className?: string;
};

export function MarketingContainer({ children, className }: Props) {
  return <div className={cn("marketing-container", className)}>{children}</div>;
}
