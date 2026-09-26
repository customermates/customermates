import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { EntityType } from "@/generated/prisma";

import {
  getGetContactsApiInteractor,
  getGetDealsApiInteractor,
  getGetOrganizationsApiInteractor,
  getGetServicesApiInteractor,
  getGetTasksApiInteractor,
} from "@/core/di";

export const entityListExecutors: Record<
  EntityType,
  (params: GetQueryParamsApi) => Promise<{ ok: boolean; data?: any; error?: any }>
> = {
  contact: async (params) => getGetContactsApiInteractor().invoke(params),
  organization: async (params) => getGetOrganizationsApiInteractor().invoke(params),
  deal: async (params) => getGetDealsApiInteractor().invoke(params),
  service: async (params) => getGetServicesApiInteractor().invoke(params),
  task: async (params) => getGetTasksApiInteractor().invoke(params),
};

export const entityNameExtractors: Record<EntityType, (item: any) => string> = {
  contact: (item) => `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
  organization: (item) => String(item.name ?? ""),
  deal: (item) => String(item.name ?? ""),
  service: (item) => String(item.name ?? ""),
  task: (item) => {
    const name = String(item.name ?? "").trim();
    return name || String(item.type ?? "");
  },
};
