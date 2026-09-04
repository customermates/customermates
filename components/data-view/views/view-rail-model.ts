import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

export const RAIL_VISIBLE_LIMIT = 12;
export const RAIL_HIT_AREA = "relative after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']";

export type RailChip =
  | { kind: "all"; isActive: boolean; isDirty: boolean }
  | { kind: "orphan" }
  | { kind: "view"; view: DataViewChipDto; isActive: boolean; isDirty: boolean };

export type ViewMenuItemId =
  | "copyLink"
  | "delete"
  | "duplicate"
  | "edit"
  | "moveLeft"
  | "moveRight"
  | "saveAsNew"
  | "saveChanges"
  | "share";

export type ViewMenuItem = {
  id: ViewMenuItemId;
  isChecked?: boolean;
  isCommit: boolean;
  isDestructive: boolean;
  isDisabled: boolean;
  kind: "action" | "checkbox";
};

export type ViewMenuContext = {
  canShareViews: boolean;
  canWriteViews: boolean;
  index: number;
  isDirty: boolean;
  total: number;
};

function byPosition(left: DataViewChipDto, right: DataViewChipDto): number {
  if (left.isOwner !== right.isOwner) return left.isOwner ? -1 : 1;
  if (left.position !== right.position) return left.position - right.position;
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function actionItem(id: ViewMenuItemId, overrides: Partial<ViewMenuItem> = {}): ViewMenuItem {
  return { id, isCommit: false, isDestructive: false, isDisabled: false, kind: "action", ...overrides };
}

export function sortViewsByPosition(views: readonly DataViewChipDto[]): DataViewChipDto[] {
  return [...views].sort(byPosition);
}

export function isOrphanedView(views: readonly DataViewChipDto[], activeViewKey: string): boolean {
  if (activeViewKey === ALL_VIEW_KEY) return false;
  return !views.some((view) => view.id === activeViewKey);
}

export function orderChips(
  views: readonly DataViewChipDto[],
  activeViewKey: string,
  isViewDirty: boolean,
  isOrphaned = false,
  limit: number = RAIL_VISIBLE_LIMIT,
): { chips: RailChip[]; hiddenCount: number } {
  const sorted = sortViewsByPosition(views);
  const orphaned = isOrphaned || isOrphanedView(views, activeViewKey);
  const capacity = Math.max(0, limit - (orphaned ? 2 : 1));
  const visible = sorted.slice(0, capacity);

  if (!orphaned && activeViewKey !== ALL_VIEW_KEY && visible.length > 0) {
    const isCut = !visible.some((view) => view.id === activeViewKey);
    const active = sorted.find((view) => view.id === activeViewKey);
    if (isCut && active) visible[visible.length - 1] = active;
  }

  const isAllActive = !orphaned && activeViewKey === ALL_VIEW_KEY;
  const chips: RailChip[] = [{ isActive: isAllActive, isDirty: isAllActive && isViewDirty, kind: "all" }];

  if (orphaned) chips.push({ kind: "orphan" });

  for (const view of visible) {
    const isActive = view.id === activeViewKey;
    chips.push({ isActive, isDirty: isActive && isViewDirty, kind: "view", view });
  }

  return { chips, hiddenCount: sorted.length - visible.length };
}

export function viewMenuItems(view: DataViewChipDto, ctx: ViewMenuContext): ViewMenuItem[] {
  const canManage = ctx.canWriteViews && view.isOwner;

  if (!canManage) {
    return [
      ...(ctx.canWriteViews ? [actionItem("duplicate")] : []),
      ...(ctx.isDirty && ctx.canWriteViews ? [actionItem("saveAsNew", { isCommit: true })] : []),
      actionItem("copyLink"),
    ];
  }

  return [
    ...(ctx.isDirty ? [actionItem("saveChanges", { isCommit: true })] : []),
    actionItem("edit"),
    actionItem("duplicate"),
    actionItem("moveLeft", { isDisabled: ctx.index <= 0 }),
    actionItem("moveRight", { isDisabled: ctx.index >= ctx.total - 1 }),
    ...(ctx.canShareViews
      ? [actionItem("share", { isChecked: view.visibility === "workspace", kind: "checkbox" })]
      : []),
    actionItem("copyLink"),
    actionItem("delete", { isDestructive: true }),
  ];
}
