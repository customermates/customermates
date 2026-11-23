import type { ReactNode } from "react";

import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { cn } from "@/core/utils/cn";

const ITEM_CLASSES = {
  sm: "size-6 [&_img]:size-3.5 [&_svg]:size-3.5",
  default: "size-8 [&_img]:size-4 [&_svg]:size-4",
};

type Item = { key: string; node: ReactNode };

type Props = {
  items: Item[];
  size?: keyof typeof ITEM_CLASSES;
  className?: string;
};

export function LogoStack({ items, size = "default", className }: Props) {
  return (
    <span aria-hidden="true" className={cn("inline-flex", className)} data-slot="logo-stack">
      <OverlappingStack
        badgeKey={(item: Item) => item.key}
        badges={items}
        maxVisible={items.length}
        renderBadge={(item: Item) => (
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-full border border-border bg-card text-foreground",
              ITEM_CLASSES[size],
            )}
            data-slot="logo-stack-item"
          >
            {item.node}
          </span>
        )}
        renderOverflow={() => null}
        size={size}
      />
    </span>
  );
}
