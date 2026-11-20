import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";

import { setAutomationRuleEnabledAction } from "../actions";
import { pauseRoutineAction, upsertRoutineAction } from "../../routines/actions";

export type AutomationViewer = {
  userId: string | undefined;
  isAdmin: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

type Row = Pick<AutomationListItemDto, "id" | "kind" | "enabled" | "ownerUserId">;

function owns(item: Pick<Row, "ownerUserId">, viewer: Pick<AutomationViewer, "userId">): boolean {
  return item.ownerUserId !== null && item.ownerUserId === viewer.userId;
}

export function canToggleAutomation(item: Row, viewer: AutomationViewer): boolean {
  return viewer.canUpdate && (owns(item, viewer) || (item.enabled && viewer.isAdmin));
}

export function canDeleteAutomation(item: Row, viewer: AutomationViewer): boolean {
  if (!viewer.canDelete) return false;
  return item.kind === "routine" ? viewer.isAdmin : viewer.isAdmin || owns(item, viewer);
}

export async function toggleAutomation(item: Row, enabled: boolean, viewer: Pick<AutomationViewer, "userId">) {
  if (item.kind === "rule") return setAutomationRuleEnabledAction({ id: item.id, enabled });
  if (!enabled && !owns(item, viewer)) return pauseRoutineAction({ id: item.id });
  return upsertRoutineAction({ id: item.id, enabled });
}
