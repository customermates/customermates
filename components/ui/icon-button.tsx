"use client";

import type { LucideIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";

export const iconButtonClass =
  "inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-[color,transform] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] motion-reduce:transition-none";

export const iconButtonIconClass = "size-3 shrink-0";

type BaseProps = {
  icon: LucideIcon;
  label: string;
  className?: string;
};

type Props = BaseProps & ({ href: string } | { onClick: () => void; disabled?: boolean; type?: "button" | "submit" });

export function IconButton({ icon: IconComponent, label, className, ...rest }: Props) {
  const control =
    "href" in rest ? (
      <IntlLink aria-label={label} className={cn(iconButtonClass, className)} href={rest.href}>
        <IconComponent aria-hidden className={iconButtonIconClass} />
      </IntlLink>
    ) : (
      <button
        aria-label={label}
        className={cn(iconButtonClass, className)}
        disabled={rest.disabled}
        type={rest.type ?? "button"}
        onClick={rest.onClick}
      >
        <IconComponent aria-hidden className={iconButtonIconClass} />
      </button>
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
