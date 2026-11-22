import type { LucideIcon } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { IntlStore } from "@/core/stores/intl.store";
import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { DraftTriggerKind } from "./automation-draft";

import {
  CalendarClock,
  CalendarDays,
  Clock,
  FileText,
  Filter,
  MessageSquare,
  Pencil,
  Plus,
  Webhook,
  Zap,
} from "lucide-react";

import { AUTOMATION_PALETTE_ITEMS } from "@/components/automations/automation-palette";
import { AutomationAgentIcon } from "@/components/automations/automation-agent-icon";
import { describeRoutineSchedule } from "@/ee/routines/routine-schedule-preset";
import { eventLabel } from "@/features/event/event-label";

import { ruleToDraft } from "./automation-draft";
import { triggerSentence } from "./automation-draft-sentence";

type Translate = ReturnType<typeof useTranslations>;

export type AutomationItemShape = {
  start: { icon: LucideIcon; text: string; schedule: boolean };
  steps: { key: string; icon: LucideIcon; agent: boolean }[];
};

const TRIGGER_ICONS: Record<DraftTriggerKind, LucideIcon> = {
  recordCreated: Plus,
  recordUpdated: Pencil,
  fieldChanged: Pencil,
  dateReached: CalendarClock,
  messageReceived: MessageSquare,
  formSubmitted: FileText,
  webhookReceived: Webhook,
  bookingChanged: CalendarDays,
  other: Zap,
};

export function automationItemShape(
  item: AutomationListItemDto,
  model: AutomationBuilderModel,
  t: Translate,
  intlStore: Pick<IntlStore, "formatTime">,
): AutomationItemShape | null {
  const agentStep = { key: "agent", icon: AutomationAgentIcon, agent: true };
  if (item.routine) {
    const { routine } = item;
    if (routine.triggerKind === "schedule") {
      return {
        start: {
          icon: Clock,
          text: describeRoutineSchedule(routine.cronExpression, t, (date) => intlStore.formatTime(date)),
          schedule: true,
        },
        steps: [agentStep],
      };
    }
    const first = routine.triggerEvents[0];
    return {
      start: { icon: Pencil, text: first ? eventLabel(t, first) : "", schedule: false },
      steps: [agentStep],
    };
  }
  if (!item.rule) return null;
  const draft = ruleToDraft(item.rule, model, "UTC");
  const conditions = draft.conditions.length > 0 ? [{ key: "condition", icon: Filter, agent: false }] : [];
  const effects = draft.effects.map((effect, index) => {
    const known = effect.kind in AUTOMATION_PALETTE_ITEMS;
    return {
      key: `effect-${index}`,
      icon: known ? AUTOMATION_PALETTE_ITEMS[effect.kind as keyof typeof AUTOMATION_PALETTE_ITEMS].icon : Zap,
      agent: effect.kind === "agent",
    };
  });
  return {
    start: { icon: TRIGGER_ICONS[draft.trigger.kind], text: triggerSentence(draft.trigger, model, t), schedule: false },
    steps: [...conditions, ...effects],
  };
}
