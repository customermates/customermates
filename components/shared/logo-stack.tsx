import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

const SIZES = {
  sm: {
    stack: "-space-x-1.5",
    item: "size-6 ring-2",
    icon: "[&_img]:size-3.5 [&_svg]:size-3.5",
  },
  default: {
    stack: "-space-x-2",
    item: "size-7 ring-2",
    icon: "[&_img]:size-4 [&_svg]:size-4",
  },
  lg: {
    stack: "-space-x-2.5",
    item: "size-10 ring-[3px] shadow-sm",
    icon: "[&_img]:size-5 [&_svg]:size-5",
  },
};

type Props = {
  items: Array<{ key: string; node: ReactNode }>;
  size?: keyof typeof SIZES;
  overflow?: ReactNode;
  className?: string;
};

export function LogoStack({ items, size = "default", overflow, className }: Props) {
  const classes = SIZES[size];
  const item = cn(
    "relative grid shrink-0 place-items-center rounded-full border border-border bg-card text-foreground ring-card",
    classes.item,
    classes.icon,
  );

  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex items-center", classes.stack, className)}
      data-slot="logo-stack"
    >
      {items.map(({ key, node }) => (
        <span key={key} className={item}>
          {node}
        </span>
      ))}

      {overflow ? (
        <span className={cn(item, "bg-muted text-[10px] font-medium text-muted-foreground")}>{overflow}</span>
      ) : null}
    </span>
  );
}
