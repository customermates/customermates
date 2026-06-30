import { z } from "zod";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { entityListExecutors, entityNameExtractors } from "@/features/search/entity-list-executors";
import {
  getGetContactByIdInteractor,
  getGetContactsConfigurationInteractor,
  getGetOrganizationByIdInteractor,
  getGetOrganizationsConfigurationInteractor,
  getGetDealByIdInteractor,
  getGetDealsConfigurationInteractor,
  getGetServiceByIdInteractor,
  getGetServicesConfigurationInteractor,
  getGetTaskByIdInteractor,
  getGetTasksConfigurationInteractor,
} from "@/core/di";

/**
 * The read-only data surface the sandboxed code reaches through the broker.
 *
 * IMPORTANT: every function here MUST run inside runWithTenant(user) — the route
 * establishes that from the run token. These reuse the SAME tenant-scoped Api
 * interactors the agent's read tools use, so company scoping + RBAC are enforced
 * exactly once, in one place. This module never reads a companyId from input.
 */

const EntitySchema = z.enum(["contact", "organization", "deal", "service", "task"]);
type Entity = z.infer<typeof EntitySchema>;

export const SANDBOX_READ_OPERATIONS = ["list", "count", "search", "get", "configuration"] as const;
export type SandboxReadOperation = (typeof SANDBOX_READ_OPERATIONS)[number];

export type SandboxDataResult = { ok: true; data: unknown } | { ok: false; error: string };

const listSchema = z.object({
  entity: EntitySchema,
  searchTerm: z.string().optional(),
  filters: z.array(FilterSchema).optional(),
  sortDescriptor: SortDescriptorSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const countSchema = z.object({ entity: EntitySchema, filters: z.array(FilterSchema).optional() });
const getSchema = z.object({ entity: EntitySchema, id: z.string().min(1) });
const configurationSchema = z.object({ entity: EntitySchema });
const searchSchema = z.object({
  searchTerm: z.string().min(1),
  entities: z.array(EntitySchema).optional(),
  limitPerEntity: z.coerce.number().int().min(1).max(100).default(5),
});

const byIdExecutors: Record<Entity, (id: string) => Promise<{ ok: boolean; data?: any; error?: any }>> = {
  contact: (id) => getGetContactByIdInteractor().invoke({ id }),
  organization: (id) => getGetOrganizationByIdInteractor().invoke({ id }),
  deal: (id) => getGetDealByIdInteractor().invoke({ id }),
  service: (id) => getGetServiceByIdInteractor().invoke({ id }),
  task: (id) => getGetTaskByIdInteractor().invoke({ id }),
};

const configurationExecutors: Record<Entity, () => Promise<{ ok: boolean; data?: any; error?: any }>> = {
  contact: () => getGetContactsConfigurationInteractor().invoke(),
  organization: () => getGetOrganizationsConfigurationInteractor().invoke(),
  deal: () => getGetDealsConfigurationInteractor().invoke(),
  service: () => getGetServicesConfigurationInteractor().invoke(),
  task: () => getGetTasksConfigurationInteractor().invoke(),
};

// The list APIs only accept these page sizes; map any requested size to a bucket.
function toPageSize(n: number): 5 | 10 | 25 | 100 {
  return n <= 5 ? 5 : n <= 10 ? 10 : n <= 25 ? 25 : 100;
}

function fail(error: unknown): SandboxDataResult {
  if (error instanceof z.ZodError) return { ok: false, error: z.prettifyError(error) };
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/** Run one read operation from the allowlist. Returns structured JSON-able data. */
export async function runSandboxRead(operation: string, rawParams: unknown): Promise<SandboxDataResult> {
  try {
    switch (operation) {
      case "list": {
        const p = listSchema.parse(rawParams);
        const r = await entityListExecutors[p.entity]({
          searchTerm: p.searchTerm,
          filters: p.filters,
          sortDescriptor: p.sortDescriptor,
          pagination: { page: p.page, pageSize: toPageSize(p.pageSize) },
        });
        if (!r.ok) return fail(r.error);
        return {
          ok: true,
          data: { items: r.data.items, total: r.data.pagination?.total ?? r.data.items.length, page: p.page },
        };
      }
      case "count": {
        const p = countSchema.parse(rawParams);
        const r = await entityListExecutors[p.entity]({ filters: p.filters, pagination: { page: 1, pageSize: 5 } });
        if (!r.ok) return fail(r.error);
        return { ok: true, data: { total: r.data.pagination?.total ?? 0 } };
      }
      case "get": {
        const p = getSchema.parse(rawParams);
        const r = await byIdExecutors[p.entity](p.id);
        if (!r.ok) return fail(r.error);
        return { ok: true, data: r.data };
      }
      case "configuration": {
        const p = configurationSchema.parse(rawParams);
        const r = await configurationExecutors[p.entity]();
        if (!r.ok) return fail(r.error);
        return { ok: true, data: r.data };
      }
      case "search": {
        const p = searchSchema.parse(rawParams);
        const targets: Entity[] = p.entities ?? ["contact", "organization", "deal", "service", "task"];
        const results = await Promise.all(
          targets.map(async (entity) => {
            const r = await entityListExecutors[entity]({
              searchTerm: p.searchTerm,
              pagination: { page: 1, pageSize: toPageSize(p.limitPerEntity) },
            });
            if (!r.ok) return { entity, items: [], error: typeof r.error === "string" ? r.error : "read failed" };
            return {
              entity,
              items: r.data.items
                .slice(0, p.limitPerEntity)
                .map((item: any) => ({ id: item.id, name: entityNameExtractors[entity](item) })),
              total: r.data.pagination?.total ?? r.data.items.length,
            };
          }),
        );
        return { ok: true, data: { searchTerm: p.searchTerm, results } };
      }
      default:
        return { ok: false, error: `Unknown operation "${operation}". Allowed: ${SANDBOX_READ_OPERATIONS.join(", ")}` };
    }
  } catch (error) {
    return fail(error);
  }
}
