import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/core/utils/cn";

type Props = Omit<ComponentProps<"div">, "children"> & {
  children: ReactNode;
};

export function FormOutput({ children, className, ...props }: Props) {
  return (
    <div
      {...props}
      aria-readonly="true"
      className={cn(
        "flex min-h-9 w-full min-w-0 cursor-text items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground shadow-none outline-none focus-visible:border-ring focus-visible:ring-[2px] focus-visible:ring-inset focus-visible:ring-ring/30",
        className,
      )}
      data-field-state="read-only"
      role="textbox"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
