import type { useTranslations } from "next-intl";
import type { AutomationCanvasStep, AutomationRunMark } from "@/components/automations/canvas/automation-canvas-types";
import type { RoutineRunDto } from "@/ee/routines/routine.schema";

import { Clock, Zap } from "lucide-react";

import { RoutineRunStatus, RoutineTriggerKind } from "@/generated/prisma";

import { AutomationAgentIcon } from "@/components/automations/automation-agent-icon";
import { describeRoutineSchedule } from "@/ee/routines/routine-schedule-preset";
import { eventLabel } from "@/features/event/event-label";

import { truncatePrompt } from "../../automations/components/automation-draft-sentence";

type Translate = ReturnType<typeof useTranslations>;

const RUN_MARK: Record<RoutineRunStatus, AutomationRunMark | null> = {
  [RoutineRunStatus.queued]: null,
  [RoutineRunStatus.running]: null,
  [RoutineRunStatus.succeeded]: "ok",
  [RoutineRunStatus.partial]: "ok",
  [RoutineRunStatus.failed]: "failed",
  [RoutineRunStatus.skipped]: "skipped",
  [RoutineRunStatus.blocked]: "failed",
};

export function routineRunMark(run: Pick<RoutineRunDto, "status">): AutomationRunMark | null {
  return RUN_MARK[run.status];
}

export type RoutineCanvasInput = {
  triggerKind: RoutineTriggerKind;
  cron: string;
  timezone: string;
  triggerEvents: readonly string[];
  prompt: string;
  run: Pick<RoutineRunDto, "status"> | null;
  invalid: { trigger: boolean; agent: boolean };
  formatTime: (date: Date) => string;
  t: Translate;
};

export function routineCanvasSteps({
  triggerKind,
  cron,
  timezone,
  triggerEvents,
  prompt,
  run,
  invalid,
  formatTime,
  t,
}: RoutineCanvasInput): AutomationCanvasStep[] {
  const scheduled = triggerKind === RoutineTriggerKind.schedule;
  const events = triggerEvents.map((event) => eventLabel(t, event)).join(", ");
  const triggerSentence = scheduled
    ? `${describeRoutineSchedule(cron, t, formatTime)} · ${timezone}`
    : events || t("Automations.canvas.chooseEvents");
  return [
    {
      id: "trigger",
      tone: "trigger",
      icon: scheduled ? Clock : Zap,
      label: t("Automations.builder.when"),
      sentence: triggerSentence,
      fixed: true,
      invalid: invalid.trigger,
      mark: run ? "ok" : null,
    },
    {
      id: "agent",
      tone: "agent",
      icon: AutomationAgentIcon,
      label: t("Automations.canvas.agentStep"),
      sentence: truncatePrompt(prompt) || t("Automations.canvas.agentPlaceholder"),
      badge: t("Automations.runsOn.mate"),
      fixed: true,
      invalid: invalid.agent,
      mark: run ? routineRunMark(run) : null,
    },
  ];
}
