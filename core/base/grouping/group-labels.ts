import type { GroupingTargetModel } from "./groupable-field";

export type GroupLabel = { label: string; avatarUrl?: string | null };

const PERSON_SELECT = { id: true, firstName: true, lastName: true, avatarUrl: true };
const NAMED_SELECT = { id: true, name: true };

export const LABEL_SELECT: Record<GroupingTargetModel, Record<string, boolean>> = {
  user: PERSON_SELECT,
  contact: { id: true, firstName: true, lastName: true },
  deal: NAMED_SELECT,
  organization: NAMED_SELECT,
  service: NAMED_SELECT,
  task: NAMED_SELECT,
};

export function toGroupLabel(model: GroupingTargetModel, row: Record<string, unknown>): GroupLabel {
  if (model === "user" || model === "contact") {
    const parts = [row.firstName, row.lastName].filter(
      (part): part is string => typeof part === "string" && part !== "",
    );

    return { label: parts.join(" "), avatarUrl: (row.avatarUrl as string | null | undefined) ?? null };
  }

  return { label: typeof row.name === "string" ? row.name : "" };
}
