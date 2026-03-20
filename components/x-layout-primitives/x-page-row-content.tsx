import type { ReactNode } from "react";

import { cn } from "@heroui/theme";

type Props = {
  children: ReactNode;
  className?: string;
};

export function XPageRowContent({ children, className }: Props) {
  const classes = cn("flex flex-col gap-4 md:gap-6 w-full lg:sticky lg:top-0 lg:self-start", className);

  return <div className={classes}>{children}</div>;
}
