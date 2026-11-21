"use client";

import type { LucideIcon } from "lucide-react";
import type { AutomationCanvasActions, AutomationCanvasStep } from "./automation-canvas-types";

import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function focusAfterRemoval(scope: Element | null, stepId: string) {
  if (!scope) return;
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      const next =
        scope.querySelector<HTMLElement>(`[data-automation-step="${stepId}"]`) ??
        Array.from(scope.querySelectorAll<HTMLElement>("[data-automation-add]")).at(-1);
      next?.focus();
    }),
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  action,
  disabled,
  destructive,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  action: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: (button: HTMLButtonElement) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          data-automation-step-action={action}
          disabled={disabled}
          size="icon-sm"
          type="button"
          variant={destructive ? "ghostDestructive" : "ghost"}
          onClick={(event) => {
            event.stopPropagation();
            onClick(event.currentTarget);
          }}
        >
          <Icon aria-hidden="true" className="size-4" />
        </Button>
      </TooltipTrigger>

      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AutomationStepToolbar({
  step,
  actions,
}: {
  step: AutomationCanvasStep;
  actions: AutomationCanvasActions;
}) {
  const t = useTranslations();
  const { onMove, onDuplicate, onRemove } = actions;
  if (step.fixed || !actions.editable) return null;
  return (
    <div
      aria-label={t("Automations.canvas.stepActions")}
      className="nodrag nopan flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 shadow-md"
      data-automation-step-toolbar={step.id}
      role="toolbar"
    >
      {onMove && (
        <>
          <ToolbarButton
            action="up"
            disabled={!step.canMoveUp}
            icon={ArrowUp}
            label={t("Automations.canvas.moveUp")}
            onClick={() => onMove(step.id, -1)}
          />

          <ToolbarButton
            action="down"
            disabled={!step.canMoveDown}
            icon={ArrowDown}
            label={t("Automations.canvas.moveDown")}
            onClick={() => onMove(step.id, 1)}
          />
        </>
      )}

      {onDuplicate && (
        <ToolbarButton
          action="duplicate"
          disabled={step.canDuplicate === false}
          icon={Copy}
          label={t("Automations.canvas.duplicate")}
          onClick={() => onDuplicate(step.id)}
        />
      )}

      {onRemove && (
        <ToolbarButton
          destructive
          action="remove"
          icon={Trash2}
          label={t("Automations.builder.removeStep")}
          onClick={(button) => {
            const scope = button.closest("[data-automation-drawer]");
            onRemove(step.id);
            focusAfterRemoval(scope, step.id);
          }}
        />
      )}
    </div>
  );
}
