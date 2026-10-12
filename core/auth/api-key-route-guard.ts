import type { PermissionRole } from "@/core/base/permission.service";

import { Action, Resource, Status } from "@/generated/prisma";

import { rolePermits } from "@/core/base/permission.service";

const API_KEY_ROUTE_ACTIONS: Readonly<Record<string, Action>> = {
  "/api-key/create": Action.create,
  "/api-key/update": Action.update,
  "/api-key/delete": Action.delete,
  "/api-key/get": Action.readAll,
  "/api-key/list": Action.readAll,
};

export type ApiKeyRouteMember = { status: Status; role: PermissionRole | null } | null;

export type ApiKeyRouteDecision = "allowed" | "inactive" | "permissionDenied";

export function canUseApiKeys(role: PermissionRole | null | undefined): boolean {
  return rolePermits(role, Resource.api, Action.readAll);
}

export function apiKeyRouteAction(path: string): Action | undefined {
  return API_KEY_ROUTE_ACTIONS[path];
}

export function decideApiKeyRoute(action: Action, member: ApiKeyRouteMember): ApiKeyRouteDecision {
  if (!member || member.status !== Status.active) return "inactive";

  return rolePermits(member.role, Resource.api, action) ? "allowed" : "permissionDenied";
}
