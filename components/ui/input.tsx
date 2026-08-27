import * as React from "react";

import { cn } from "@/core/utils/cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-input-background px-3 py-1.5 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
        "read-only:cursor-text read-only:border-border read-only:bg-background read-only:shadow-none read-only:focus-visible:border-ring read-only:focus-visible:ring-[2px] read-only:focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:border-border disabled:bg-background disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:ring-inset",
        className,
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
