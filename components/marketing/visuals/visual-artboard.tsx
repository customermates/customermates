import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/core/utils/cn";

export function VisualArtboard({ children, className, role, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("relative isolate w-full overflow-hidden rounded-xl bg-sidebar text-foreground", className)}
      role={role ?? "img"}
      {...props}
    >
      {children}
    </div>
  );
}
