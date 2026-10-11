import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/core/utils/cn";

export function VisualArtboard({ children, className, role, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden rounded-3xl bg-foreground/[0.025] bg-[radial-gradient(85%_65%_at_15%_0%,color-mix(in_oklab,var(--color-primary)_14%,transparent),transparent_70%)] text-foreground",
        className,
      )}
      role={role ?? "img"}
      {...props}
    >
      {children}
    </div>
  );
}
