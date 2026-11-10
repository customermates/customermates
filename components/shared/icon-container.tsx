import type { SVGProps } from "react";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/core/utils/cn";

import { Icon } from "./icon";

const iconContainerVariants = cva("rounded-lg flex items-center justify-center", {
  variants: {
    size: {
      sm: "size-6",
      md: "size-9",
      lg: "size-11",
    },
    color: {
      primary: "bg-primary/8",
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
  const iconColorClass = "text-foreground";

  return (
    <div aria-hidden className={cn(iconContainerVariants({ size, color }), className)}>
      <Icon className={cn(iconColorClass, iconClassName)} icon={icon} size={iconSize} />
    </div>
  );
}
