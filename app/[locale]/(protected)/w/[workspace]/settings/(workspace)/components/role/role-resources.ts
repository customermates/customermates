import type { AppMode } from "@/core/config/environment";

import { Resource } from "@/generated/prisma";

const SYSTEM_RESOURCE_ORDER: readonly Resource[] = [
  Resource.api,
  Resource.users,
  Resource.company,
  Resource.dataModel,
  Resource.wiki,
  Resource.activityLog,
  Resource.inboxMessages,
  Resource.routines,
  Resource.publicLinks,
];

const CLOUD_ONLY_RESOURCES: ReadonlySet<Resource> = new Set([Resource.inboxMessages]);

export function visibleSystemResources(appMode: AppMode): Resource[] {
  return SYSTEM_RESOURCE_ORDER.filter((resource) => appMode !== "self-hosted" || !CLOUD_ONLY_RESOURCES.has(resource));
}

export function isAutomationsOnlyRow(resource: Resource, appMode: AppMode): boolean {
  return resource === Resource.routines && appMode === "self-hosted";
}
