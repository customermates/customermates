import type { SVGProps } from "react";

import { cn } from "@/core/utils/cn";

type IconSize = "sm" | "md" | "lg";

type Props = SVGProps<SVGSVGElement> & {
  icon: React.FC<SVGProps<SVGSVGElement>>;
  size?: IconSize;
};

const sizeClasses: Record<IconSize, string> = {
  sm: "min-w-3 min-h-3 h-3 w-3",
  md: "min-w-4 min-h-4 h-4 w-4",
  lg: "min-w-5 min-h-5 h-5 w-5",
};

export function Icon({ icon: IconComponent, className = "", size = "md", ...props }: Props) {
  return <IconComponent className={cn(sizeClasses[size], className)} {...props} />;
}
