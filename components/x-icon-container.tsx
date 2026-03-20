import type { SVGProps } from "react";

import { cn } from "@heroui/theme";

import { XIcon } from "./x-icon";

type Props = {
  icon: React.FC<SVGProps<SVGSVGElement>>;
  iconClassName?: string;
  iconSize?: "sm" | "md" | "lg";
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
};

export function XIconContainer({ icon, iconClassName, iconSize = "md", className, size = "md" }: Props) {
  return (
    <div
      className={cn(
        sizeClasses[size],
        "rounded-xl bg-linear-to-br from-primary-500/30 to-primary-600/20 dark:from-primary-500/20 dark:to-primary-600/10 border border-primary-500/40 dark:border-primary-500/30 shadow-md shadow-primary-500/20 dark:shadow-primary-500/10 flex items-center justify-center",
        className,
      )}
    >
      <XIcon className={cn("text-primary-600 dark:text-primary-400", iconClassName)} icon={icon} size={iconSize} />
    </div>
  );
}
