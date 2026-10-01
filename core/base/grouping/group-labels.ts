import type { GroupingTargetModel } from "./groupable-field";

export type GroupLabel = { label: string; avatarUrl?: string | null };

const PERSON_SELECT = { id: true, firstName: true, lastName: true, avatarUrl: true };

export const LABEL_SELECT: Record<GroupingTargetModel, Record<string, boolean>> = {
  user: PERSON_SELECT,
};

export function toGroupLabel(model: GroupingTargetModel, row: Record<string, unknown>): GroupLabel {
  if (model === "user") {
    const parts = [row.firstName, row.lastName].filter(
      (part): part is string => typeof part === "string" && part !== "",
    );

    return { label: parts.join(" "), avatarUrl: (row.avatarUrl as string | null | undefined) ?? null };
  }

  return { label: typeof row.name === "string" ? row.name : "" };
}
