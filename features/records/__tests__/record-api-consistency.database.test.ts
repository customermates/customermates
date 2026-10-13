import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { Client } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import messages from "@/i18n/locales/en.json";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));

await import("@/core/di");
await import("@/features/mcp-tools/tool-registry");
const { createRestRouteWorkspace, postAs, restRoute } = await import("@/tests/helpers/rest-route-workspace");
const { executeMcpTool } = await import("@/features/mcp-tools/mcp-tool");
const { configureRecordModelV2Tool, mutateRecordV2Tool } = await import("@/features/mcp-tools/record-model.mcp-tools");
const recordActions = await import("@/app/[locale]/(protected)/records/actions");
const mutateRoute = await restRoute("/v1/records/mutate");
const previewRoute = await restRoute("/v1/model/preview");
const applyRoute = await restRoute("/v1/model/apply");
const readModelRoute = await restRoute("/v1/model/read");

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

async function workspace() {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

async function createDeal(w: Workspace, fields: Array<{ fieldId: string; value: unknown }>) {
  return {
    expectedRevision: await w.revision(),
    idempotencyKey: randomUUID(),
    mutation: { action: "create", typeId: w.id("deal"), fields },
  };
}

async function holdingCompanyLock<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  const holder = new Client({ connectionString: process.env.DATABASE_URL });
  await holder.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    return await fn();
  } finally {
    await holder.query("ROLLBACK");
    await holder.end();
  }
}

describeDatabase("record API consistency against PostgreSQL", () => {
  it("answers a write that waits on a busy workspace with a structured rate limit on every channel", async () => {
    const w = await workspace();
    const create = () => createDeal(w, [{ fieldId: w.id("deal.name"), value: { kind: "text", value: "Busy" } }]);
    const busy = { kind: "rate_limit", issues: [{ code: "custom", path: [], message: expect.any(String) }] };

    await holdingCompanyLock(w.companyId, async () => {
      const startedAt = Date.now();
      expect(await postAs(w, w.admin, mutateRoute, await create())).toEqual({ status: 429, body: { error: busy } });
      expect(Date.now() - startedAt).toBeLessThan(15_000);

      const input = mutateRecordV2Tool.inputSchema.parse(await create());
      const tool = await w.as(w.admin, () => executeMcpTool(mutateRecordV2Tool as never, [input]));
      expect(tool).toMatchObject({ ok: false, failure: { kind: "rate_limit" } });

      const action = await w.as(w.admin, async () => recordActions.mutateRecordAction((await create()) as never));
      expect(action).toMatchObject({
        ok: false,
        failure: {
          kind: "rate_limit",
          retryable: true,
          issues: [{ path: [], customCode: "serviceBusy", message: messages.Common.errors.serviceBusy }],
        },
      });
    });

    expect((await postAs(w, w.admin, mutateRoute, await create())).status).toBe(200);
  }, 120_000);

  it("reports malformed formatted text at the field that carries it", async () => {
    const w = await workspace();
    const create = () =>
      createDeal(w, [
        { fieldId: w.id("deal.name"), value: { kind: "text", value: "Notes" } },
        {
          fieldId: w.id("deal.notes"),
          value: { kind: "richText", documentJson: JSON.stringify({ type: "script", content: [] }) },
        },
      ]);
    const invalid = {
      kind: "validation",
      issues: [
        {
          code: "custom",
          path: ["mutation", "fields", 1, "value"],
          message: messages.Common.errors.notesInvalidFormat,
          customCode: "notesInvalidFormat",
        },
      ],
    };

    expect(await postAs(w, w.admin, mutateRoute, await create())).toEqual({ status: 400, body: { error: invalid } });
    const input = mutateRecordV2Tool.inputSchema.parse(await create());
    expect(await w.as(w.admin, () => executeMcpTool(mutateRecordV2Tool as never, [input]))).toMatchObject({
      ok: false,
      failure: invalid,
    });
    expect(await w.as(w.admin, async () => recordActions.mutateRecordAction((await create()) as never))).toMatchObject({
      ok: false,
      failure: invalid,
    });
  }, 120_000);

  it("refuses a sub-list of a sub-list in preview and apply over REST and MCP", async () => {
    const w = await workspace();
    const creation = {
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      operations: [
        {
          operation: "createType",
          reference: "$parts",
          label: "Part",
          pluralLabel: "Parts",
          description: "",
          icon: "list",
          embedded: true,
          accessPresetId: null,
        },
        {
          operation: "putRelationship",
          relationship: {
            id: "$partLine",
            sourceTypeId: "$parts",
            targetTypeId: w.id("lineItem"),
            sourceLabel: "Line item",
            targetLabel: "Parts",
            sourceCardinality: "one",
            targetCardinality: "many",
            onSourceDelete: "unlink",
            onTargetDelete: "cascade",
            messagesOnSource: false,
            messagesOnTarget: false,
          },
        },
      ],
    };
    const preview = await postAs(w, w.admin, previewRoute, creation);
    expect(preview.status).toBe(200);
    const reference = (name: string) =>
      (preview.body.references as Array<{ reference: string; id: string }>).find((item) => item.reference === name)?.id;
    expect((await postAs(w, w.admin, applyRoute, creation)).status).toBe(200);
    const partsId = reference("$parts");
    const relationId = reference("$partLine");
    const model = await postAs(w, w.admin, readModelRoute, {});
    const parts = (model.body.types as Array<{ id: string }>).find((type) => type.id === partsId);
    if (!parts || !relationId) throw new Error("The sub-list fixture was not created");

    const nest = async () => ({
      expectedRevision: await w.revision(),
      idempotencyKey: randomUUID(),
      operations: [{ operation: "putType", type: { ...parts, parentRelationshipId: relationId } }],
    });
    const nested = await postAs(w, w.admin, previewRoute, await nest());
    expect(nested.status).toBe(200);
    expect(nested.body.valid).toBe(false);
    expect(nested.body.issues).toContainEqual({ code: "nested_sublist", typeId: partsId });

    const refused = {
      kind: "validation",
      issues: [
        {
          code: "custom",
          path: [],
          message: messages.Common.errors.recordSublistNested,
          customCode: "recordSublistNested",
        },
      ],
    };
    expect(await postAs(w, w.admin, applyRoute, await nest())).toEqual({ status: 400, body: { error: refused } });
    const input = configureRecordModelV2Tool.inputSchema.parse({ action: "apply", change: await nest() });
    expect(await w.as(w.admin, () => executeMcpTool(configureRecordModelV2Tool as never, [input]))).toMatchObject({
      ok: false,
      failure: refused,
    });
  }, 120_000);
});
