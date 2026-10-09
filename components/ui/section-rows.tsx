import type { ComponentProps } from "react";

import { Slot } from "radix-ui";

import { cn } from "@/core/utils/cn";

export const SECTION_INSET_CLASS = "[--section-inset:--spacing(3)] [--section-inset-end:--spacing(3)]";

export const CARD_INSET_CLASS = "[--section-inset:--spacing(6)]";

export function SectionRows({ className, asChild = false, ...props }: ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      className={cn(
        "mx-[calc(var(--section-inset)*-1)] divide-y divide-border *:px-(--section-inset) last:mb-[calc(var(--section-inset-end)*-1)]",
        className,
      )}
      data-slot="section-rows"
      {...props}
    />
  );
}
