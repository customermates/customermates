import type { ReactNode } from "react";

import { cn } from "@heroui/theme";

type Props = {
  label: string;
  children: ReactNode;
  classNames?: {
    label?: string;
    value?: string;
  };
};

export function XInfoRow({ label, children, classNames }: Props) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className={cn("text-xs font-semibold text-subdued uppercase", classNames?.label)}>{label}</span>

      <span className={cn("block truncate font-medium text-x-xs", classNames?.value)}>{children}</span>
    </div>
  );
}
