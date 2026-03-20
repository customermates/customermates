import type { SVGProps } from "react";

import { cn } from "@heroui/theme";

type Props = SVGProps<SVGSVGElement> & {
  icon: React.FC<SVGProps<SVGSVGElement>>;
  size?: "sm" | "md" | "lg";
};

export function XIcon({ icon: Icon, className = "", size = "md", ...props }: Props) {
  const sizeClass = cn({
    "min-w-3 min-h-3 h-3 w-3": size === "sm",
    "min-w-4 min-h-4 h-4 w-4": size === "md",
    "min-w-5 min-h-5 h-5 w-5": size === "lg",
  });

  return <Icon className={cn(sizeClass, className)} {...props} />;
}
