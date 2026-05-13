import type { GetQueryParamsApi } from "@/core/base/base-get.schema";

import { z } from "zod";

import {
  getGetContactsApiInteractor,
  getGetDealsApiInteractor,
  getGetOrganizationsApiInteractor,
  getGetServicesApiInteractor,
  getGetTasksApiInteractor,
} from "@/core/app-di";

export const EntityKindSchema = z.enum(["contact", "organization", "deal", "service", "task"]);
export type EntityKind = z.infer<typeof EntityKindSchema>;

export const entityListExecutors: Record<
  EntityKind,
  (params: GetQueryParamsApi) => Promise<{ ok: boolean; data?: any; error?: any }>
> = {
  contact: async (params) => getGetContactsApiInteractor().invoke(params),
  organization: async (params) => getGetOrganizationsApiInteractor().invoke(params),
  deal: async (params) => getGetDealsApiInteractor().invoke(params),
  service: async (params) => getGetServicesApiInteractor().invoke(params),
  task: async (params) => getGetTasksApiInteractor().invoke(params),
};

export const entityNameExtractors: Record<EntityKind, (item: any) => string> = {
  contact: (item) => `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
  organization: (item) => String(item.name ?? ""),
  deal: (item) => String(item.name ?? ""),
  service: (item) => String(item.name ?? ""),
  // System tasks store an empty `name` and rely on i18n; fall back to `type` so callers
  // (search results, MCP filters) get a stable identifier they can disambiguate.
  task: (item) => {
    const name = String(item.name ?? "").trim();
    return name || String(item.type ?? "");
  },
};
