import type { ReactNode } from "react";

import { cn } from "@heroui/theme";

type Props = {
  columns?: "1" | "1/4" | "1/1" | "2/1" | "3/1";
  columnDirection?: "default" | "reverse";
  children: ReactNode;
  className?: string;
};

export function XPageRow({ columns = "1", columnDirection = "default", children, className }: Props) {
  const classes = cn("flex flex-col relative w-full gap-4 md:gap-6", {
    "flex-col-reverse": columnDirection === "reverse",
    "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]": columns === "1/1",
    "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,4fr)]": columns === "1/4",
    "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]": columns === "2/1",
    "lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]": columns === "3/1",
    "grid-cols-1": columns === "1",
  });

  return <div className={cn(classes, className)}>{children}</div>;
}
