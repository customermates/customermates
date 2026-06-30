import { z } from "zod";

import type { McpTool } from "@/app/api/v1/mcp/mcp-route-utils";

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

// ---- Backend tool RPC (sandbox code -> server-side tool execution) ----------
//
// Sandboxed code can invoke the SAME backend tools the agent has, executed here
// inside runWithTenant(tokenUser) so they run with the user's company scope + RBAC
// (the @TenantInteractor re-resolves to the token user). run_code/check_run are
// excluded (they'd recurse). This is a powerful surface — gated by: the run token's
// "tool" capability, the run_code approval card (the human sees the exact code), and
// a per-run call cap below. Durable audit + quotas are task #27.
// Lazily loaded + memoized: importing the full tool registry pulls the app's DI/auth
// graph, so we defer it to the first tool call (reads never pay for it, and importing
// this module for runSandboxRead stays side-effect-light).
let callableToolsCache: Map<string, McpTool> | null = null;
async function getCallableTools(): Promise<Map<string, McpTool>> {
  if (callableToolsCache) return callableToolsCache;
  const { ALL_MCP_TOOLS } = await import("@/features/mcp-tools/all-tools");
  callableToolsCache = new Map(
    ALL_MCP_TOOLS.filter((t) => t.name !== "run_code" && t.name !== "check_run").map((t) => [t.name, t]),
  );
  return callableToolsCache;
}

// Per-run backstops keyed by the token jti (spans all of a run's broker calls). They
// bound a SINGLE approved run's blast radius — most importantly writeRecords, since the
// tool schemas allow up to 100 ids/items per call (200 calls x 100 = 20k records without
// this). These are per-run, in-process, best-effort. A durable per-tenant rolling quota
// + single-use jti nonce that survives multi-instance/serverless is task #27 and should
// land before the write surface ships to a multi-instance prod.
const MAX_TOOL_CALLS_PER_RUN = 200; // backend tool calls (read-only + write)
const MAX_READ_OPS_PER_RUN = 2_000; // crm read ops (list/count/search/get/configuration)
const MAX_WRITE_RECORDS_PER_RUN = 1_000; // cumulative records created/updated/deleted in one run
const MAX_COUNTERS = 1_000; // hygiene cap on the counter map

type RunCounter = { toolCalls: number; readOps: number; writeRecords: number; expiresAt: number };
const counterRef = globalThis as unknown as { __sandboxRunCounters?: Map<string, RunCounter> };
const runCounters: Map<string, RunCounter> = (counterRef.__sandboxRunCounters ??= new Map());

function getRunCounter(jti: string): RunCounter {
  const now = Date.now();
  for (const [k, v] of runCounters) if (now > v.expiresAt) runCounters.delete(k);
  if (runCounters.size > MAX_COUNTERS) {
    let over = runCounters.size - MAX_COUNTERS;
    for (const k of runCounters.keys()) {
      if (over-- <= 0) break;
      runCounters.delete(k);
    }
  }
  let c = runCounters.get(jti);
  // A run can't outlive its ~35s token; 5 min is generous cleanup slack.
  if (!c || now > c.expiresAt) {
    c = { toolCalls: 0, readOps: 0, writeRecords: 0, expiresAt: now + 5 * 60 * 1000 };
    runCounters.set(jti, c);
  }
  return c;
}

// Best-effort affected-record count for a mutating call (e.g. ids[].length /
// items[].length) so one approved run can't delete/update tens of thousands.
function countRecords(args: unknown): number {
  if (!args || typeof args !== "object") return 1;
  const arrays = Object.values(args as Record<string, unknown>).filter(Array.isArray) as unknown[][];
  return arrays.length ? Math.max(...arrays.map((a) => a.length)) : 1;
}

const toolCallSchema = z.object({ name: z.string().min(1), args: z.unknown().optional() });

/**
 * Invoke one backend tool by name with args, server-side, in the caller's tenant
 * context (the route has already established runWithTenant). The tool's own
 * @TenantInteractor enforces RBAC; this layer enforces the capability + call cap and
 * audits the call. Returns the tool's text output.
 */
export async function runSandboxTool(
  rawParams: unknown,
  ctx: { jti: string; caps: string[]; companyId: string },
): Promise<SandboxDataResult> {
  try {
    if (!ctx.caps.includes("tool")) return { ok: false, error: "This run is not authorized to call backend tools." };
    const { name, args } = toolCallSchema.parse(rawParams);

    const counter = getRunCounter(ctx.jti);
    counter.toolCalls += 1;
    if (counter.toolCalls > MAX_TOOL_CALLS_PER_RUN) {
      return {
        ok: false,
        error: `Per-run tool-call limit reached (${MAX_TOOL_CALLS_PER_RUN}). Stop and report progress.`,
      };
    }

    const sandboxTool = (await getCallableTools()).get(name);
    if (!sandboxTool) return { ok: false, error: `Unknown tool "${name}".` };

    // Read-only by default: any tool not explicitly readOnlyHint:true is a mutation
    // (create/update/delete/send/link/…) and needs the run's "write" capability,
    // which is only granted when the agent ran code with allowWrite: true.
    const isWrite = sandboxTool.annotations?.readOnlyHint !== true;
    if (isWrite && !ctx.caps.includes("write")) {
      return {
        ok: false,
        error: `Tool "${name}" modifies data, but this run is read-only. Re-run run_code with allowWrite: true to permit changes.`,
      };
    }

    // Validate args against the tool's own schema before executing (the interactor
    // re-validates too); pass the parsed value through.
    const parsed = sandboxTool.inputSchema.safeParse(args ?? {});
    if (!parsed.success) return fail(parsed.error);

    // Bound the cumulative records a single run may mutate (the real blast-radius cap;
    // the call cap above only bounds count, and each call can touch up to 100 records).
    const records = isWrite ? countRecords(parsed.data) : 0;
    if (isWrite) {
      counter.writeRecords += records;
      if (counter.writeRecords > MAX_WRITE_RECORDS_PER_RUN) {
        return {
          ok: false,
          error: `Per-run write limit reached (~${MAX_WRITE_RECORDS_PER_RUN} records). Split large changes into separate, deliberate runs.`,
        };
      }
    }

    console.warn(
      `[sandbox-tool] company=${ctx.companyId} run=${ctx.jti} call#${counter.toolCalls} tool=${name}${isWrite ? ` WRITE +${records} (run total ${counter.writeRecords})` : ""}`,
    );

    const out = await (sandboxTool.execute as (a: unknown) => Promise<string> | string)(parsed.data);
    return { ok: true, data: out };
  } catch (error) {
    return fail(error);
  }
}

/** Run one read operation from the allowlist. Returns structured JSON-able data.
 * ctx.jti (when provided by the broker) enforces a per-run read-call cap so one
 * approved run can't flood the app DB with unbounded interactor queries. */
export async function runSandboxRead(
  operation: string,
  rawParams: unknown,
  ctx?: { jti: string },
): Promise<SandboxDataResult> {
  if (ctx?.jti) {
    const counter = getRunCounter(ctx.jti);
    counter.readOps += 1;
    if (counter.readOps > MAX_READ_OPS_PER_RUN) {
      return {
        ok: false,
        error: `Per-run read limit reached (${MAX_READ_OPS_PER_RUN}). Narrow your queries or paginate.`,
      };
    }
  }
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
