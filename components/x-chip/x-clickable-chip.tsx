"use client";

import type { ChipProps } from "@heroui/chip";

import { XChip } from "./x-chip";

type Props = {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
} & Omit<ChipProps, "onClick">;

export function XClickableChip({ children, onClick, ...props }: Props) {
  const baseClassName =
    "cursor-pointer select-none transform-gpu hover:opacity-hover active:scale-[0.97] transition-transform-colors-opacity motion-reduce:transition-none";

  const className = `${props?.className || ""} ${baseClassName}`.trim();

  return (
    <XChip {...props} className={className} onClick={onClick}>
      {children}
    </XChip>
  );
}
