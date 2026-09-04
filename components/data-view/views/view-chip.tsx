"use client";

import type { FC, KeyboardEventHandler, MouseEventHandler, ReactNode, SVGProps } from "react";

import { UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

import { RAIL_HIT_AREA } from "./view-rail-model";

type Props = {
  href?: string;
  icon?: FC<SVGProps<SVGSVGElement>>;
  id?: string;
  isActive: boolean;
  isDirty: boolean;
  isShared: boolean;
  label: string;
  preview: ReactNode;
  tabIndex: 0 | -1;
  variant?: "default" | "outline" | "secondary";
  onKeyDown?: KeyboardEventHandler<HTMLAnchorElement>;
  onSelect?: MouseEventHandler<HTMLAnchorElement>;
};

export function ViewChip({
  href,
  icon: Icon,
  id,
  isActive,
  isDirty,
  isShared,
  label,
  preview,
  tabIndex,
  variant = "secondary",
  onKeyDown,
  onSelect,
}: Props) {
  const t = useTranslations();

  const body = (
    <>
      {Icon && <Icon aria-hidden className={cn("size-3", !isActive && "opacity-70")} />}

      <span className="truncate">{label}</span>

      {isShared && <UsersIcon aria-hidden className="size-3 opacity-60" />}

      {isShared && <span className="sr-only">, {t("DataView.views.sharedState")}</span>}

      {isDirty && <span aria-hidden className="ml-0.5 size-1.5 shrink-0 rounded-full bg-current" />}

      {isDirty && <span className="sr-only">, {t("DataView.views.dirty")}</span>}
    </>
  );

  const className = cn("h-[22px] max-w-36 flex-none overflow-visible px-1.5 sm:max-w-56", RAIL_HIT_AREA);

  const chip = href ? (
    <Badge asChild interactive className={className} data-slot="badge" variant={variant}>
      <a
        aria-current={isActive ? "page" : undefined}
        data-view-chip=""
        href={href}
        id={id}
        tabIndex={tabIndex}
        onClick={onSelect}
        onKeyDown={onKeyDown}
      >
        {body}
      </a>
    </Badge>
  ) : (
    <Badge className={className} data-slot="badge" data-view-chip="" id={id} variant={variant}>
      {body}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>

      <TooltipContent className="max-w-xs">{preview}</TooltipContent>
    </Tooltip>
  );
}
