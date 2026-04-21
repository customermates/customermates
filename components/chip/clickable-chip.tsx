"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { AppChip } from "./app-chip";

type Props = Omit<ComponentProps<typeof AppChip>, "onClick"> & {
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

export function ClickableChip({ children, className, onClick, ...props }: Props) {
  return (
    <AppChip {...props} className={cn("interactive-surface select-none", className)} onClick={onClick}>
      {children}
    </AppChip>
  );
}
