"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";
import {
  OVERLAY_ACTION_RAIL_CLASS,
  OVERLAY_ICON_CONTROL_CLASS,
  OVERLAY_ICON_CONTROL_DESTRUCTIVE_CLASS,
  OVERLAY_ICON_CONTROL_NEUTRAL_CLASS,
} from "@/components/ui/overlay-contract";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";

export type AppModalActionVariant = "neutral" | "destructive";

type SharedActionProps = {
  id: string;
  icon: LucideIcon;
  label: string;
  tooltip?: ReactNode;
  variant?: AppModalActionVariant;
};

type ButtonActionProps = SharedActionProps & {
  busy?: boolean;
  disabled?: boolean;
  external?: never;
  href?: never;
  onClick: () => void | Promise<void>;
};

type LinkActionProps = SharedActionProps & {
  busy?: never;
  disabled?: never;
  external?: boolean;
  href: string;
  onClick?: never;
};

export type AppModalActionProps = ButtonActionProps | LinkActionProps;

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
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
      </a>
    ) : (
      <IntlLink
        aria-label={label}
        className={className}
        data-overlay-action=""
        data-size="icon"
        data-slot="app-modal-action"
        data-variant={variant}
        href={props.href}
      >
        {content}
      </IntlLink>
    )
  ) : (
    <button
      aria-hidden={isDisabled || undefined}
      aria-label={isDisabled ? undefined : label}
      className={className}
      data-overlay-action=""
      data-size="icon"
      data-slot="app-modal-action"
      data-variant={variant}
      disabled={props.disabled || isBusy}
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
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>

      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}
