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
    | { href: string; external?: boolean }
    | {
        onClick: () => void;
        disabled?: boolean;
        pressed?: boolean;
        tabIndex?: number;
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
      rest.external ? (
        <a
          aria-label={label}
          className={controlClassName}
          href={rest.href}
          rel={/^https?:/i.test(rest.href) ? "noopener noreferrer" : undefined}
          target={/^https?:/i.test(rest.href) ? "_blank" : undefined}
        >
          <IconComponent aria-hidden className={controlIconClassName} />
        </a>
      ) : (
        <IntlLink aria-label={label} className={controlClassName} href={rest.href}>
          <IconComponent aria-hidden className={controlIconClassName} />
        </IntlLink>
      )
    ) : (
      <button
        aria-label={label}
        aria-pressed={rest.pressed}
        className={controlClassName}
        disabled={rest.disabled}
        tabIndex={rest.tabIndex}
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
