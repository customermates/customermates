import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/core/utils/cn";

type Props = ComponentPropsWithoutRef<"div"> & { tone?: "agent" | "ink" };

export function VisualArtboard({ children, className, role, tone = "agent", ...props }: Props) {
  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden rounded-3xl bg-foreground/[0.025] text-foreground",
        tone === "agent"
          ? "bg-[radial-gradient(85%_65%_at_15%_0%,color-mix(in_oklab,var(--foreground)_5%,transparent),transparent_70%)]"
          : "bg-[radial-gradient(85%_65%_at_15%_0%,color-mix(in_oklab,var(--foreground)_5%,transparent),transparent_70%)]",
        className,
      )}
      data-tone={tone}
      role={role ?? "img"}
      {...props}
    >
      {children}
    </div>
  );
}
