import type { AppMode } from "@/core/config/environment";
import type { RecordFieldView } from "@/features/records/record-model.schema";

type ReminderField = Pick<RecordFieldView, "id" | "typeId" | "archived" | "valueType" | "label">;

export type AutomationOffers = {
  automateHref: string | undefined;
  reminders: { id: string; label: string; href: string }[];
};

export function automationOffers(input: {
  canUseAutomations: boolean;
  typeId: string;
  fields: readonly ReminderField[];
}): AutomationOffers {
  if (!input.canUseAutomations) return { automateHref: undefined, reminders: [] };

  return {
    automateHref: `/automations?new=${input.typeId}`,
    reminders: input.fields
      .filter(
        (field) =>
          field.typeId === input.typeId &&
          !field.archived &&
          (field.valueType === "date" || field.valueType === "dateTime"),
      )
      .map((field) => ({
        id: field.id,
        label: field.label,
        href: `/automations?remind=${input.typeId}:${field.id}`,
      })),
  };
}

export function canOfferScheduleMeeting(appMode: AppMode): boolean {
  return appMode !== "self-hosted";
}
