"use client";

import type { LucideIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import {
  fieldActionButtonClass,
  fieldActionIconClass,
  iconButtonClass,
  iconButtonIconClass,
} from "./icon-button-styles";

type BaseProps = {
  icon: LucideIcon;
  label: string;
  className?: string;
  iconClassName?: string;
  fieldAction?: boolean;
};

type Props = BaseProps &
  (
    | { href: string }
    | {
        onClick: () => void;
        disabled?: boolean;
        pressed?: boolean;
        type?: "button" | "submit";
      }
  );

export function IconButton({
  icon: IconComponent,
  label,
  className,
  iconClassName,
  fieldAction = false,
  ...rest
}: Props) {
  const controlClassName = cn(iconButtonClass, fieldAction && fieldActionButtonClass, className);
  const controlIconClassName = cn(iconButtonIconClass, fieldAction && fieldActionIconClass, iconClassName);
  const control =
    "href" in rest ? (
      <IntlLink aria-label={label} className={controlClassName} href={rest.href}>
        <IconComponent aria-hidden className={controlIconClassName} />
      </IntlLink>
    ) : (
      <button
        aria-label={label}
        aria-pressed={rest.pressed}
        className={controlClassName}
        disabled={rest.disabled}
        type={rest.type ?? "button"}
        onClick={rest.onClick}
      >
        <IconComponent aria-hidden className={controlIconClassName} />
      </button>
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export { fieldActionButtonClass, fieldActionIconClass, iconButtonClass, iconButtonIconClass };
