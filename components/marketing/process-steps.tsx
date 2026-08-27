import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/core/utils/cn";

export function Steps({ children, className, ...props }: ComponentPropsWithoutRef<"ol">) {
  return (
    <ol
      {...props}
      className={cn("fd-steps not-prose my-10 list-none border-border", "[&_li:last-child]:pb-0", className)}
      data-process-steps="true"
    >
      {children}
    </ol>
  );
}

export function Step({
  children,
  className,
  title,
  ...props
}: Omit<ComponentPropsWithoutRef<"li">, "title"> & { title: ReactNode }) {
  return (
    <li
      {...props}
      className={cn(
        "fd-step relative list-none pb-10 ps-1 scroll-mt-28",
        "before:-start-10 before:border before:border-border-strong before:bg-card before:text-foreground before:shadow-sm before:content-[counter(step)] sm:before:-start-11",
        className,
      )}
      data-process-step="true"
    >
      <h3 className="m-0 text-lg leading-snug font-medium tracking-tight">{title}</h3>

      <div
        className={cn(
          "mt-2.5 space-y-3 text-sm leading-relaxed text-muted-foreground",
          "[&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline",
          "[&_p]:m-0 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground",
          "[&_strong]:font-medium [&_strong]:text-foreground",
        )}
      >
        {children}
      </div>
    </li>
  );
}
