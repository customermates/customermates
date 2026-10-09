"use client";

import type { MouseEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";
import {
  OVERLAY_ACTION_RAIL_CLASS,
  overlayIconControlClass,
  type OverlayIconControlVariant,
} from "@/components/ui/overlay-contract";
import { AskAiAction } from "@/components/ui/ask-ai-action";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";

export type AppModalActionVariant = OverlayIconControlVariant;

export type AppModalActionKind = "assistant" | "customize" | "other" | "destructive" | "navigate";

const ACTION_KIND_ORDER: Record<AppModalActionKind, number> = {
  assistant: 0,
  customize: 1,
  other: 2,
  destructive: 3,
  navigate: 4,
};

type SharedActionProps = {
  id: string;
  kind?: AppModalActionKind;
  anchorId?: string;
  icon: LucideIcon;
  label: string;
  tooltip?: ReactNode;
  variant?: AppModalActionVariant;
};

export type AppModalButtonActionProps = SharedActionProps & {
  busy?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  external?: never;
  href?: never;
  onClick: () => void | Promise<void>;
};

type LinkActionProps = SharedActionProps & {
  busy?: never;
  disabled?: never;
  pressed?: never;
  external?: boolean;
  href: string;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onClick?: never;
};

export type AppModalActionProps = AppModalButtonActionProps | LinkActionProps;

export const APP_MODAL_ACTION_RAIL_CLASS = OVERLAY_ACTION_RAIL_CLASS;

function isLinkAction(props: AppModalActionProps): props is LinkActionProps {
  return typeof props.href === "string";
}

export function isAskAiAction(action: AppModalActionProps) {
  return action.kind === "assistant" && !isLinkAction(action);
}

export function appModalActionSlots(actions: readonly AppModalActionProps[]) {
  return actions.reduce((slots, action) => slots + (isAskAiAction(action) ? 2 : 1), 0);
}

export function AppModalAction(props: AppModalActionProps) {
  if (isAskAiAction(props) && props.onClick) return <AskAiAction id={props.anchorId} onClick={props.onClick} />;
  const { icon: Icon, label, tooltip, variant = "neutral" } = props;
  const isBusy = "busy" in props && props.busy === true;
  const isDisabled = !isLinkAction(props) && (props.disabled === true || isBusy);
  const className = overlayIconControlClass(variant);
  const content = <Icon aria-hidden className={cn("size-4", isBusy && "animate-spin")} />;

  const control = isLinkAction(props) ? (
    props.external ? (
      <a
        aria-label={label}
        className={className}
        data-overlay-action=""
        data-size="icon"
        data-slot="app-modal-action"
        data-variant={variant}
        href={props.href}
        id={props.anchorId}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
      </a>
    ) : (
      <IntlLink
        aria-label={label}
        className={className}
        data-navigation-guard-handled={props.onNavigate ? "" : undefined}
        data-overlay-action=""
        data-size="icon"
        data-slot="app-modal-action"
        data-variant={variant}
        href={props.href}
        id={props.anchorId}
        onClick={props.onNavigate}
      >
        {content}
      </IntlLink>
    )
  ) : (
    <button
      aria-hidden={isDisabled || undefined}
      aria-label={isDisabled ? undefined : label}
      aria-pressed={props.pressed}
      className={className}
      data-overlay-action=""
      data-size="icon"
      data-slot="app-modal-action"
      data-variant={variant}
      disabled={props.disabled || isBusy}
      id={props.anchorId}
      type="button"
      onClick={() => runUserAction(props.onClick)}
    >
      {content}
    </button>
  );
  const trigger = isDisabled ? (
    <span
      aria-busy={isBusy || undefined}
      aria-disabled="true"
      aria-label={label}
      className="inline-flex"
      data-slot="app-modal-action-disabled-trigger"
      role="button"
      tabIndex={0}
    >
      {control}
    </span>
  ) : (
    control
  );

  return (
    <Tooltip key={isDisabled ? "disabled" : "enabled"}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>

      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}

function actionKind(action: AppModalActionProps): AppModalActionKind {
  return (
    action.kind ?? (action.variant === "destructive" ? "destructive" : isLinkAction(action) ? "navigate" : "other")
  );
}

export function orderAppModalActions(actions: readonly AppModalActionProps[]) {
  return [...actions].sort((a, b) => ACTION_KIND_ORDER[actionKind(a)] - ACTION_KIND_ORDER[actionKind(b)]);
}

export function AppModalActionRail({
  actions,
  className,
}: {
  actions: readonly AppModalActionProps[];
  className?: string;
}) {
  if (actions.length === 0) return null;
  return (
    <TooltipProvider>
      <div
        className={cn("flex min-h-8 shrink-0 items-center gap-2 self-start", className)}
        data-slot="app-modal-actions"
      >
        {orderAppModalActions(actions).map((action) => (
          <AppModalAction key={action.id} {...action} />
        ))}
      </div>
    </TooltipProvider>
  );
}
