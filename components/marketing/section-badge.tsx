import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  children: ReactNode;
  className?: string;
};

export function SectionBadge({ children, className }: Props) {
  return (
    <div
      className={cn(
        "inline-block rounded-md bg-primary/15 px-3 py-1 text-sm font-medium text-primary dark:bg-primary/20",
        className,
      )}
    >
      {children}
    </div>
  );
}
