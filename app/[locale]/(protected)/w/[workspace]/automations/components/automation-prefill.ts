import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft } from "./automation-draft";

import { Action, Resource } from "@/generated/prisma";

import { reminderDraft } from "./automation-draft";

export type AutomationsPrefill =
  | { kind: "new"; typeId: string }
  | { kind: "remind"; typeId: string; fieldId: string }
  | null;

export type AutomationPrefillOpening = { typeId: string; draft?: AutomationDraft };

type Rights = { can(resource: Resource, action: Action): boolean };

export function canStartAutomation(user: Rights): boolean {
  return user.can(Resource.routines, Action.create);
}

export function prefillOpening(
  prefill: AutomationsPrefill,
  options: { canCreate: boolean; model: AutomationBuilderModel; timezone: string },
): AutomationPrefillOpening | null {
  if (!prefill || !options.canCreate) return null;
  const { model, timezone } = options;
  if (!model.lists.some((list) => list.id === prefill.typeId)) return null;
  if (prefill.kind === "new") return { typeId: prefill.typeId };
  return {
    typeId: prefill.typeId,
    draft: reminderDraft(model, { typeId: prefill.typeId, fieldId: prefill.fieldId, timezone }),
  };
}
