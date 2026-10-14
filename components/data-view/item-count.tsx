"use client";

import type { ComponentProps } from "react";

import { Layers } from "lucide-react";
import { observer } from "mobx-react-lite";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";

export const ItemCount = observer(function ItemCount({
  count,
  className,
  ...props
}: ComponentProps<"span"> & { count: number }) {
  const intlStore = useHydratedIntlStore();
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums", className)}
      {...props}
    >
      <Layers aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />

      {intlStore.formatNumber(count)}
    </span>
  );
});
