"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

type ButtonProps = {
  blocker: string | null;
  className?: string;
  fullWidth?: boolean;
  id: string;
  label: string;
  size?: "sm" | "default";
  slot: string;
  variant?: "secondary" | "ghostDestructive";
  onClick: () => void;
};

type ReasonProps = {
  blocker: string | null;
  className?: string;
  id: string;
  slot: string;
};

function blockedReasonId(id: string): string {
  return `${id}-reason`;
}

export function BlockableWorkspaceReason({ blocker, className, id, slot }: ReasonProps) {
  if (!blocker) return null;

  return (
    <p
      className={cn("hidden text-xs text-subdued max-sm:block pointer-coarse:block", className)}
      data-slot={`${slot}-reason`}
      id={blockedReasonId(id)}
    >
      {blocker}
    </p>
  );
}

export function BlockableWorkspaceButton({
  blocker,
  className,
  fullWidth = false,
  id,
  label,
  size = "sm",
  slot,
  variant = "secondary",
  onClick,
}: ButtonProps) {
  const button = (
    <Button
      className={cn(fullWidth && "w-full", className)}
      disabled={blocker !== null}
      id={id}
      size={size}
      type="button"
      variant={variant}
      onClick={onClick}
    >
      {label}
    </Button>
  );
  if (!blocker) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-describedby={blockedReasonId(id)}
          aria-disabled="true"
          aria-label={label}
          className={fullWidth ? "flex w-full" : "inline-flex w-fit"}
          data-slot={`${slot}-blocked`}
          role="button"
          tabIndex={0}
        >
          {button}
        </span>
      </TooltipTrigger>

      <TooltipContent>{blocker}</TooltipContent>
    </Tooltip>
  );
}
