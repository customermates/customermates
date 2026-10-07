import { Action, Resource } from "@/generated/prisma";

export const MANAGE_ACTIONS = [Action.create, Action.update, Action.delete] as const;
export type ManageAction = (typeof MANAGE_ACTIONS)[number];
export type ReadAccess = "all" | "own" | "none";

type ResourceAccess = Readonly<{ manage: readonly ManageAction[]; read: readonly ReadAccess[] }>;

const ALL_MANAGE = MANAGE_ACTIONS;
const READ_ALL_OR_NONE = ["all", "none"] as const;
const READ_SCOPED = ["all", "own", "none"] as const;

export const RESOURCE_ACCESS = {
  [Resource.api]: { manage: ALL_MANAGE, read: READ_ALL_OR_NONE },
  [Resource.users]: { manage: ALL_MANAGE, read: READ_SCOPED },
  [Resource.company]: { manage: [Action.update], read: [] },
  [Resource.dataModel]: { manage: [Action.update], read: [] },
  [Resource.wiki]: { manage: ALL_MANAGE, read: READ_ALL_OR_NONE },
  [Resource.auditLog]: { manage: [], read: READ_ALL_OR_NONE },
  [Resource.inboxMessages]: { manage: ALL_MANAGE, read: READ_ALL_OR_NONE },
  [Resource.routines]: { manage: ALL_MANAGE, read: READ_SCOPED },
} as const satisfies Record<Resource, ResourceAccess>;

export const RECORD_TYPE_ACCESS: ResourceAccess = { manage: ALL_MANAGE, read: READ_SCOPED };

export type ManageActionOf<R extends Resource> = (typeof RESOURCE_ACCESS)[R]["manage"][number];

export function manageImpliesReadAll(resource: Resource): boolean {
  return resource === Resource.wiki;
}

export function grantableActions(access: ResourceAccess): Action[] {
  return [
    ...access.manage,
    ...(access.read.includes("all") ? [Action.readAll] : []),
    ...(access.read.includes("own") ? [Action.readOwn] : []),
  ];
}

export type AccessRow = { create: boolean; update: boolean; delete: boolean; readAccess: ReadAccess };

export function accessRow(actions: readonly string[]): AccessRow {
  return {
    create: actions.includes(Action.create),
    update: actions.includes(Action.update),
    delete: actions.includes(Action.delete),
    readAccess: actions.includes(Action.readAll) ? "all" : actions.includes(Action.readOwn) ? "own" : "none",
  };
}

export function rowActions(row: AccessRow, access: ResourceAccess): Action[] {
  return [
    ...access.manage.filter((action) => row[action]),
    ...(row.readAccess === "all" && access.read.includes("all") ? [Action.readAll] : []),
    ...(row.readAccess === "own" && access.read.includes("own") ? [Action.readOwn] : []),
  ];
}
