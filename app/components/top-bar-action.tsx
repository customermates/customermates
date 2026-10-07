"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

type Props = Omit<ComponentProps<typeof Button>, "asChild" | "children" | "size" | "variant"> & {
  icon: LucideIcon;
  label: string;
  emphasis?: "primary" | "secondary";
  iconOnly?: boolean;
  spinning?: boolean;
  href?: string;
  endContent?: ReactNode;
};

export function TopBarAction({
  icon: IconComponent,
  label,
  emphasis = "secondary",
  iconOnly = false,
  spinning = false,
  href,
  endContent,
  className,
  ...buttonProps
}: Props) {
  const content = (
    <>
      <IconComponent aria-hidden className={cn(iconOnly ? "size-4" : "size-3.5", spinning && "animate-spin")} />

      {!iconOnly && <span className="hidden sm:inline">{label}</span>}

      {endContent}
    </>
  );
  const button = (
    <Button
      aria-label={label}
      asChild={href !== undefined}
      className={cn("h-8", className)}
      data-top-bar-action=""
      size={iconOnly ? "icon-sm" : "sm"}
      variant={emphasis === "primary" ? "default" : "secondary"}
      {...buttonProps}
    >
      {href === undefined ? content : <IntlLink href={href}>{content}</IntlLink>}
    </Button>
  );

  if (!iconOnly) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
