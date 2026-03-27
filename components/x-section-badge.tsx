import type { ReactNode } from "react";

import { cn } from "@heroui/theme";

type Props = {
  children: ReactNode;
  className?: string;
};

export function XSectionBadge({ children, className }: Props) {
  return (
    <div
      className={cn(
        "inline-block bg-linear-to-br from-primary-500/30 to-primary-600/20 dark:from-primary-500/20 dark:to-primary-600/10 border border-primary-500/40 dark:border-primary-500/30 shadow-md shadow-primary-500/20 dark:shadow-primary-500/10 text-primary-600 dark:text-primary-400 px-3 py-1 rounded-md text-sm font-medium",
        className,
      )}
    >
      {children}
    </div>
  );
}
