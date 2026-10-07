"use client";

import type { MouseEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";
import {
  OVERLAY_ACTION_RAIL_CLASS,
  OVERLAY_ICON_CONTROL_CLASS,
  OVERLAY_ICON_CONTROL_DESTRUCTIVE_CLASS,
  OVERLAY_ICON_CONTROL_NEUTRAL_CLASS,
} from "@/components/ui/overlay-contract";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";

export type AppModalActionVariant = "neutral" | "destructive";

/**
 * Where an action sits in the header rail. The rail always renders, left to right:
 * assistant (Ask AI), customize, other, destructive (Delete), navigate (Open page), then the overlay's Close.
 */
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
  /** Defaults to "destructive" for destructive actions, "navigate" for links and "other" otherwise. */
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
  /** Marks a toggle action; announced as pressed when true. */
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
  /** Intercepts in-app navigation, e.g. to hand off an open draft before leaving. */
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onClick?: never;
};

export type AppModalActionProps = AppModalButtonActionProps | LinkActionProps;

export const APP_MODAL_ACTION_RAIL_CLASS = OVERLAY_ACTION_RAIL_CLASS;

const actionVariantClassMap: Record<AppModalActionVariant, string> = {
  neutral: OVERLAY_ICON_CONTROL_NEUTRAL_CLASS,
  destructive: OVERLAY_ICON_CONTROL_DESTRUCTIVE_CLASS,
};

function isLinkAction(props: AppModalActionProps): props is LinkActionProps {
  return typeof props.href === "string";
}

export function AppModalAction(props: AppModalActionProps) {
  const { icon: Icon, label, tooltip, variant = "neutral" } = props;
  const isBusy = "busy" in props && props.busy === true;
  const isDisabled = !isLinkAction(props) && (props.disabled === true || isBusy);
  const className = cn(OVERLAY_ICON_CONTROL_CLASS, actionVariantClassMap[variant]);
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

/** Sorts header actions into the fixed rail order; stable within a kind. */
export function orderAppModalActions(actions: readonly AppModalActionProps[]) {
  return [...actions].sort((a, b) => ACTION_KIND_ORDER[actionKind(a)] - ACTION_KIND_ORDER[actionKind(b)]);
}

/**
 * The one overlay header action rail: icon-only actions styled like Close, each with the app tooltip,
 * in the fixed order of {@link AppModalActionKind}. AppModal places it beside Close with
 * APP_MODAL_ACTION_RAIL_CLASS; sheet editors put it last in their header row.
 */
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
        className={cn("flex min-h-9 shrink-0 items-center gap-2 self-start", className)}
        data-slot="app-modal-actions"
      >
        {orderAppModalActions(actions).map((action) => (
          <AppModalAction key={action.id} {...action} />
        ))}
      </div>
    </TooltipProvider>
  );
}
