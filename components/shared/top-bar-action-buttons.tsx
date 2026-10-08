"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LoaderCircle, Plus } from "lucide-react";

import { orderAppModalActions, type AppModalActionProps } from "@/components/modal/app-modal-action";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { IntlLink } from "@/i18n/navigation";

function TopBarActionButton({ action }: { action: AppModalActionProps }) {
  const { label, tooltip } = action;
  const busy = action.busy === true;
  const Icon = busy ? LoaderCircle : action.icon;
  const withLabel = action.kind === "assistant";
  const variant = action.variant === "destructive" ? "destructiveOutline" : "secondary";
  const size = withLabel ? "sm" : "icon-sm";
  const content = withLabel ? (
    <>
      <Icon aria-hidden className={busy ? "size-4 animate-spin" : "size-4"} />

      <span className="hidden sm:inline">{label}</span>
    </>
  ) : (
    <Icon aria-hidden className={busy ? "size-4 animate-spin" : "size-4"} />
  );
  const disabled = !action.href && (action.disabled === true || busy);
  const control = action.href ? (
    action.external ? (
      <Button asChild aria-label={label} className="h-8" data-slot="top-bar-action" size={size} variant={variant}>
        <a href={action.href} id={action.anchorId} rel="noreferrer" target="_blank">
          {content}
        </a>
      </Button>
    ) : (
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
    )
  ) : (
    <Button
      aria-hidden={disabled || undefined}
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
    <TooltipProvider>
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
    </TooltipProvider>
  );
}

export function TopBarActionButtons({ actions }: { actions: readonly AppModalActionProps[] }) {
  return orderAppModalActions(actions).map((action) => <TopBarActionButton key={action.id} action={action} />);
}

export function TopBarPrimaryButton({
  label,
  icon: Icon = Plus,
  leading,
  anchorId,
  count,
  disabled,
  ...target
}: {
  label: string;
  icon?: LucideIcon;
  leading?: ReactNode;
  anchorId?: string;
  count?: number;
  disabled?: boolean;
} & ({ onClick: () => void } | { href: string } | { menu: ReactNode })) {
  const content = (
    <>
      {leading ?? <Icon aria-hidden className="size-3.5" />}

      <span className="hidden sm:inline">{label}</span>

      {count ? (
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-warning/25 px-1.5 text-[11px] font-medium text-warning tabular-nums">
          {count}
        </span>
      ) : null}
    </>
  );

  if ("href" in target) {
    return (
      <Button asChild aria-label={label} className="h-8" data-slot="top-bar-action" size="sm" variant="default">
        <IntlLink href={target.href} id={anchorId}>
          {content}
        </IntlLink>
      </Button>
    );
  }

  const button = (
    <Button
      aria-label={label}
      className="h-8"
      data-slot="top-bar-action"
      disabled={disabled}
      id={anchorId}
      size="sm"
      type="button"
      variant="default"
      onClick={"onClick" in target ? target.onClick : undefined}
    >
      {content}
    </Button>
  );

  if (!("menu" in target)) return button;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>

      <DropdownMenuContent align="end" aria-labelledby={anchorId}>
        {target.menu}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBarMenuButton({
  icon: Icon,
  label,
  anchorId,
  busy = false,
  disabled = false,
  primary = false,
  children,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  anchorId?: string;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
  children: ReactNode;
  "data-transfer-menu"?: string;
  "data-thread-folder-move"?: boolean;
}) {
  const ActiveIcon = busy ? LoaderCircle : Icon;

  return (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={label}
                className="h-8"
                data-slot="top-bar-action"
                disabled={busy || disabled}
                id={anchorId}
                size={primary ? "sm" : "icon-sm"}
                type="button"
                variant={primary ? "default" : "secondary"}
                {...props}
              >
                <ActiveIcon aria-hidden className={busy ? "size-4 animate-spin" : primary ? "size-3.5" : "size-4"} />

                {primary && <span className="hidden sm:inline">{label}</span>}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>

          <TooltipContent>{label}</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" aria-labelledby={anchorId}>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
