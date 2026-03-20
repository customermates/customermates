import type { ReactNode } from "react";

import { cn } from "@heroui/theme";

type Props = {
  children: ReactNode;
  className?: string;
};

export function XDataViewCell({ children, className }: Props) {
  return <span className={cn("block truncate font-medium text-x-xs", className)}>{children}</span>;
}
