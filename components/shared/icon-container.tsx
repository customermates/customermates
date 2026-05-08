import type { SVGProps } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";

const iconContainerVariants = cva("rounded-lg flex items-center justify-center", {
  variants: {
    size: {
      sm: "size-6",
      md: "size-9",
      lg: "size-11",
    },
    color: {
      primary: "bg-primary/15 shadow-[0_0_10px_0] shadow-primary/15 dark:bg-primary/20 dark:shadow-primary/20",
      muted: "bg-muted",
      accent: "bg-accent",
    },
  },
  defaultVariants: {
    size: "md",
    color: "primary",
  },
});

type Props = {
  icon: React.FC<SVGProps<SVGSVGElement>>;
  iconClassName?: string;
  iconSize?: "sm" | "md" | "lg";
  className?: string;
} & VariantProps<typeof iconContainerVariants>;

export function IconContainer({
  icon,
  iconClassName,
  iconSize = "md",
  className,
  size = "md",
  color = "primary",
}: Props) {
  const iconColorClass = color === "primary" ? "text-primary dark:text-primary" : "text-foreground";

  return (
    <div className={cn(iconContainerVariants({ size, color }), className)}>
      <Icon className={cn(iconColorClass, iconClassName)} icon={icon} size={iconSize} />
    </div>
  );
}
