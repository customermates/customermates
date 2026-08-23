import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type Props = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  withHorizontalPadding?: boolean;
};

export function ShowcaseFrame({ children, className, contentClassName, withHorizontalPadding = true }: Props) {
  return (
    <div className={cn("relative mb-10 w-full max-w-marketing", withHorizontalPadding && "px-4", className)}>
      <div className={cn("overflow-hidden rounded-card border border-border bg-card p-2", contentClassName)}>
        <div className="overflow-hidden rounded-lg">{children}</div>
      </div>
    </div>
  );
}
