"use client";

import type { ReactNode } from "react";

import { CircleHelpIcon } from "lucide-react";

import { fieldActionButtonClass, fieldActionIconClass, iconButtonClass } from "@/components/ui/icon-button-styles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function FormFieldHelp({ label, children, className }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button aria-label={label} className={cn(iconButtonClass, fieldActionButtonClass, className)} type="button">
          <CircleHelpIcon aria-hidden className={fieldActionIconClass} />
        </button>
      </TooltipTrigger>

      <TooltipContent className="max-w-72 leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}
