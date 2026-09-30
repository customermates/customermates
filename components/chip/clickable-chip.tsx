"use client";

import type { ComponentProps } from "react";

import { cn } from "@/core/utils/cn";

import { AppChip } from "./app-chip";

type Props = Omit<ComponentProps<typeof AppChip>, "onClick"> & {
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

export function ClickableChip({ children, className, onClick, ...props }: Props) {
  return (
    <AppChip
      {...props}
      interactive
      className={cn("select-none", className)}
      role={props.role ?? (onClick ? "button" : undefined)}
      tabIndex={props.tabIndex ?? (onClick ? 0 : undefined)}
      onClick={onClick}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (onClick && !event.defaultPrevented && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      {children}
    </AppChip>
  );
}
