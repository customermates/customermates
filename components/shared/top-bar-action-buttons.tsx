"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Plus } from "lucide-react";

import { orderAppModalActions, type AppModalActionProps } from "@/components/modal/app-modal-action";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { IntlLink } from "@/i18n/navigation";

export function TopBarActionButton({ action }: { action: AppModalActionProps }) {
  const { icon: Icon, label, tooltip } = action;
  const withLabel = action.kind === "assistant";
  const variant = action.variant === "destructive" ? "destructiveOutline" : "secondary";
  const size = withLabel ? "sm" : "icon-sm";
  const content = withLabel ? (
    <>
      <Icon aria-hidden className="size-4" />

      <span className="hidden sm:inline">{label}</span>
    </>
  ) : (
    <Icon aria-hidden className="size-4" />
  );
  const disabled = !action.href && (action.disabled === true || action.busy === true);
  const control = action.href ? (
    <Button asChild aria-label={label} className="h-8" data-slot="top-bar-action" size={size} variant={variant}>
      <IntlLink
        data-navigation-guard-handled={action.onNavigate ? "" : undefined}
        href={action.href}
        id={action.anchorId}
        onClick={action.onNavigate}
      >
        {content}
      </IntlLink>
    </Button>
  ) : (
    <Button
      aria-label={label}
      aria-pressed={action.pressed}
      className="h-8"
      data-slot="top-bar-action"
      disabled={disabled}
      id={action.anchorId}
      size={size}
      type="button"
      variant={variant}
      onClick={() => {
        if (action.onClick) runUserAction(action.onClick);
      }}
    >
      {content}
    </Button>
  );
  return (
    <Tooltip key={disabled ? "disabled" : "enabled"}>
      <TooltipTrigger asChild>
        {disabled ? (
          <span aria-disabled="true" aria-label={label} className="inline-flex" role="button" tabIndex={0}>
            {control}
          </span>
        ) : (
          control
        )}
      </TooltipTrigger>

      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBarActionButtons({ actions }: { actions: readonly AppModalActionProps[] }) {
  return orderAppModalActions(actions).map((action) => <TopBarActionButton key={action.id} action={action} />);
}

export function TopBarAddButton({
  label,
  anchorId,
  onClick,
}: {
  label: string;
  anchorId?: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className="h-8"
      data-slot="top-bar-action"
      id={anchorId}
      size="sm"
      type="button"
      variant="default"
      onClick={onClick}
    >
      <Plus aria-hidden className="size-3.5" />

      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

export function TopBarMenuButton({
  icon: Icon,
  label,
  anchorId,
  children,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  anchorId?: string;
  children: ReactNode;
  "data-transfer-menu"?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className="h-8"
          data-slot="top-bar-action"
          id={anchorId}
          size="icon-sm"
          type="button"
          variant="secondary"
          {...props}
        >
          <Icon aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" aria-labelledby={anchorId}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
