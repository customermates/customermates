import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { DATA_VIEW_NAME_MAX_LENGTH } from "@/core/data-view/data-view-limits";

type RailChip = { view: DataViewChipDto; isActive: boolean };

export type ViewMenuItemId = "copyLink" | "delete" | "duplicate" | "edit" | "moveLeft" | "moveRight";

export type ViewMenuItem = {
  id: ViewMenuItemId;
  isDestructive: boolean;
  isDisabled: boolean;
};

type ViewMenuContext = {
  index: number;
  total: number;
};

function byPosition(left: DataViewChipDto, right: DataViewChipDto): number {
  if (left.position !== right.position) return left.position - right.position;
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function actionItem(id: ViewMenuItemId, overrides: Partial<ViewMenuItem> = {}): ViewMenuItem {
  return { id, isDestructive: false, isDisabled: false, ...overrides };
}

export function sortViewsByPosition(views: readonly DataViewChipDto[]): DataViewChipDto[] {
  return [...views].sort(byPosition);
}

export function orderChips(views: readonly DataViewChipDto[], activeViewKey: string): RailChip[] {
  return sortViewsByPosition(views).map((view) => ({ isActive: view.id === activeViewKey, view }));
}

export function viewMenuItems(ctx: ViewMenuContext): ViewMenuItem[] {
  return [
    actionItem("edit"),
    actionItem("duplicate"),
    actionItem("moveLeft", { isDisabled: ctx.index <= 0 }),
    actionItem("moveRight", { isDisabled: ctx.index >= ctx.total - 1 }),
    actionItem("copyLink"),
    actionItem("delete", { isDestructive: true }),
  ];
}

export function allViewMenuItems(): ViewMenuItem[] {
  return [actionItem("copyLink")];
}

export function suggestedViewName(parts: readonly string[], fallback: string): string {
  let name = "";
  for (const part of parts.map((entry) => entry.trim()).filter(Boolean)) {
    const candidate = name ? `${name} · ${part}` : part;
    if (candidate.length <= DATA_VIEW_NAME_MAX_LENGTH) {
      name = candidate;
      continue;
    }
    if (!name) name = `${part.slice(0, DATA_VIEW_NAME_MAX_LENGTH - 1).trimEnd()}…`;
    break;
  }

  return name || fallback;
}
